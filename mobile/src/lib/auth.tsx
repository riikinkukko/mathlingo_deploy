import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, setApiToken, setUnauthorizedHandler } from "./api";
import { loadToken, saveToken } from "./storage";
import { queryClient } from "./query";
import { unregisterPush } from "./push";
import type { SessionPayload, UserSummary } from "./types";

type State = { status: "loading" } | { status: "signedOut" } | { status: "signedIn"; user: UserSummary };

interface AuthApi {
  state: State;
  login(email: string, password: string): Promise<void>;
  register(input: { name: string; email: string; password: string; consent: boolean }): Promise<void>;
  logout(): Promise<void>;
  /** Обновить профиль после изменения настроек на сервере. */
  setUser(user: UserSummary): void;
}

const Ctx = createContext<AuthApi | null>(null);
const USER_KEY = "planimetrika_user_v1";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  const apply = useCallback(async (p: SessionPayload) => {
    setApiToken(p.token);
    await saveToken(p.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(p.user));
    setState({ status: "signedIn", user: p.user });
  }, []);

  const clear = useCallback(async () => {
    setApiToken(null);
    await saveToken(null);
    await AsyncStorage.removeItem(USER_KEY);
    queryClient.clear();
    setState({ status: "signedOut" });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void clear());
    (async () => {
      const token = await loadToken();
      if (!token) return setState({ status: "signedOut" });
      setApiToken(token);
      try {
        // Свежий токен при каждом запуске — сессия в приложении не истекает.
        await apply(await api<SessionPayload>("/api/m/me"));
      } catch (e) {
        if (e instanceof ApiError && e.offline) {
          // Без сети — входим по сохранённому профилю, данные берутся из кэша.
          const cached = await AsyncStorage.getItem(USER_KEY);
          if (cached) return setState({ status: "signedIn", user: JSON.parse(cached) as UserSummary });
        }
        await clear();
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, [apply, clear]);

  const value = useMemo<AuthApi>(
    () => ({
      state,
      login: async (email, password) => apply(await api<SessionPayload>("/api/m/auth/login", { body: { email, password } })),
      register: async (input) => apply(await api<SessionPayload>("/api/m/auth/register", { body: input })),
      logout: async () => {
        await unregisterPush().catch(() => {});
        await clear();
      },
      setUser: (user) => {
        setState({ status: "signedIn", user });
        AsyncStorage.setItem(USER_KEY, JSON.stringify(user)).catch(() => {});
      },
    }),
    [state, apply, clear]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth вне AuthProvider");
  return v;
}

export function useUser(): UserSummary {
  const { state } = useAuth();
  if (state.status !== "signedIn") throw new Error("Нет пользователя");
  return state.user;
}
