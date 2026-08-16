/**
 * Тонкий клиент ЮKassa REST API v3. Никакого SDK не подключаем — у ЮKassa
 * простой REST-протокол, а официальный SDK на Node/TS не так широко
 * поддерживается, как хотелось бы. Авторизация — Basic Auth: shopId как
 * логин, secretKey как пароль.
 *
 * ВАЖНО: этот файл я не могу протестировать end-to-end сам — для реального
 * запроса к api.yookassa.ru нужны настоящие (хотя бы тестовые) shopId и
 * secretKey из личного кабинета ЮKassa, которых у меня нет и быть не может.
 * Реализовано максимально аккуратно по документации ЮKassa, но финальная
 * проверка на живых запросах — со стороны того, у кого есть эти ключи.
 */

const API_BASE = "https://api.yookassa.ru/v3";

function getAuthHeader(): string {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    throw new Error("YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY не заданы в переменных окружения");
  }
  return "Basic " + Buffer.from(`${shopId}:${secretKey}`).toString("base64");
}

export function isYooKassaConfigured(): boolean {
  return !!process.env.YOOKASSA_SHOP_ID && !!process.env.YOOKASSA_SECRET_KEY;
}

export interface CreatePaymentResult {
  id: string;
  confirmationUrl: string;
}

/**
 * Создаёт платёж в ЮKassa и возвращает ссылку, на которую нужно
 * перенаправить пользователя для завершения оплаты (redirect-подтверждение —
 * самый универсальный способ, работает без встраивания виджета на сайт).
 *
 * idempotenceKey обязателен по протоколу ЮKassa — если тот же запрос
 * (например, из-за повторной отправки формы) прилетит с тем же ключом,
 * ЮKassa вернёт УЖЕ созданный платёж вместо создания дубликата.
 */
export async function createYooKassaPayment(params: {
  amountRub: number;
  description: string;
  returnUrl: string;
  idempotenceKey: string;
  metadata?: Record<string, string>;
}): Promise<CreatePaymentResult> {
  const res = await fetch(`${API_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      "Idempotence-Key": params.idempotenceKey,
    },
    body: JSON.stringify({
      amount: { value: params.amountRub.toFixed(2), currency: "RUB" },
      confirmation: { type: "redirect", return_url: params.returnUrl },
      capture: true, // автоматическое списание сразу после подтверждения оплаты
      description: params.description,
      metadata: params.metadata,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ЮKassa вернула ошибку ${res.status}: ${body}`);
  }

  const data = await res.json();
  const confirmationUrl = data?.confirmation?.confirmation_url;
  if (!data?.id || !confirmationUrl) {
    throw new Error("ЮKassa вернула неожиданный формат ответа (нет id или confirmation_url)");
  }
  return { id: data.id, confirmationUrl };
}

// Диапазоны IP, с которых ЮKassa реально отправляет вебхуки — вместо
// подписи они рекомендуют именно проверку по IP (см. их документацию).
// Список может обновляться на их стороне; если вебхуки вдруг перестанут
// доходить — первым делом сверьте актуальный список в личном кабинете
// ЮKassa (Интеграция → HTTP-уведомления) и обновите здесь.
const YOOKASSA_IP_RANGES = [
  "185.71.76.0/27",
  "185.71.77.0/27",
  "77.75.153.0/25",
  "77.75.156.11",
  "77.75.156.35",
  "77.75.154.128/25",
  "2a02:5180::/32",
];

function ipToLong(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes("/")) return ip === cidr;
  const [range, bitsStr] = cidr.split("/");
  if (range.includes(":")) return false; // IPv6-диапазоны здесь не сравниваем побитово, см. ниже
  const bits = parseInt(bitsStr, 10);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  try {
    return (ipToLong(ip) & mask) === (ipToLong(range) & mask);
  } catch {
    return false;
  }
}

/** true, если IP похож на один из документированных диапазонов ЮKassa.
 * Намеренно "мягкая" проверка (не считаем IPv6 побитово) — если сомневаетесь
 * в безопасности для вашего случая, дополнительно сверяйте payment.id через
 * GET-запрос к самой ЮKassa перед тем, как доверять телу вебхука. */
export function isYooKassaIp(ip: string): boolean {
  return YOOKASSA_IP_RANGES.some((range) => isIpInCidr(ip, range));
}
