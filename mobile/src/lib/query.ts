import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { QueryClient, onlineManager } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { ApiError } from "./api";

// Онлайн/офлайн — по NetInfo: без сети запросы не дёргаются, а при появлении
// связи данные обновляются сами.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false && state.isInternetReachable !== false))
);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Кэш живёт неделю: уроки, программа и разборы открываются без сети.
      gcTime: 7 * 24 * 3600_000,
      networkMode: "offlineFirst",
      retry: (count, e) => !(e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) && count < 2,
    },
    mutations: { networkMode: "always" },
  },
});

export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: "planimetrika_cache_v1" });
