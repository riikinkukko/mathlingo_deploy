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
 *
 * savePaymentMethod:true — просим ЮKassa запомнить способ оплаты для
 * будущих автосписаний (тариф репетитора). ВАЖНО: по документации ЮKassa
 * автоплатежи по умолчанию работают только в тестовом магазине — для
 * реального нужно отдельное разрешение от менеджера ЮKassa, это не
 * настраивается через API/код в принципе.
 */
export async function createYooKassaPayment(params: {
  amountRub: number;
  description: string;
  returnUrl: string;
  idempotenceKey: string;
  metadata?: Record<string, string>;
  savePaymentMethod?: boolean;
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
      ...(params.savePaymentMethod ? { save_payment_method: true } : {}),
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

/**
 * Автоплатёж — повторное безакцептное списание по уже сохранённому
 * способу оплаты (payment_method_id), без участия и подтверждения
 * пользователя. НЕТ объекта confirmation — в этом ключевое отличие от
 * обычного платежа: пользователь никуда не перенаправляется, результат
 * приходит тем же вебхуком payment.succeeded/payment.canceled, что и
 * для обычных платежей.
 */
export async function createRecurringYooKassaPayment(params: {
  amountRub: number;
  description: string;
  paymentMethodId: string;
  idempotenceKey: string;
  metadata?: Record<string, string>;
}): Promise<{ id: string; status: string }> {
  const res = await fetch(`${API_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      "Idempotence-Key": params.idempotenceKey,
    },
    body: JSON.stringify({
      amount: { value: params.amountRub.toFixed(2), currency: "RUB" },
      capture: true,
      payment_method_id: params.paymentMethodId,
      description: params.description,
      metadata: params.metadata,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ЮKassa вернула ошибку ${res.status}: ${body}`);
  }

  const data = await res.json();
  if (!data?.id) {
    throw new Error("ЮKassa вернула неожиданный формат ответа (нет id)");
  }
  return { id: data.id, status: data.status };
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

/** Разворачивает IPv6-адрес (с учётом сокращения "::") в 128-битное число
 * — BigInt нужен, так как обычный JS number не может точно хранить 128
 * бит. Понимает и полную форму (8 групп по 4 hex-цифры), и сокращённую
 * ("::" вместо одной последовательности нулевых групп). */
function ipv6ToBigInt(ip: string): bigint {
  const [head, tail] = ip.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  const groups = [...headParts, ...Array(Math.max(missing, 0)).fill("0"), ...tailParts];
  const SHIFT_16_BITS = BigInt(65536); // 2^16 — то же самое, что "acc << 16" для неотрицательных чисел
  const ZERO = BigInt(0);
  return groups.reduce((acc, group) => acc * SHIFT_16_BITS + BigInt(parseInt(group || "0", 16)), ZERO);
}

function isIpv6InCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = BigInt(bitsStr ?? "128");
  const ZERO = BigInt(0);
  const ONE = BigInt(1);
  const BITS_128 = BigInt(128);
  const mask = bits === ZERO ? ZERO : (~ZERO << (BITS_128 - bits)) & ((ONE << BITS_128) - ONE);
  try {
    return (ipv6ToBigInt(ip) & mask) === (ipv6ToBigInt(range) & mask);
  } catch {
    return false;
  }
}

function isIpInCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes("/")) return ip === cidr;
  const [range, bitsStr] = cidr.split("/");
  // IPv6 отличается наличием ":" в адресе — у IPv4 такого символа не
  // бывает, этого достаточно, чтобы выбрать правильную ветку сравнения.
  if (range.includes(":") || ip.includes(":")) return isIpv6InCidr(ip, cidr);
  const bits = parseInt(bitsStr, 10);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  try {
    return (ipToLong(ip) & mask) === (ipToLong(range) & mask);
  } catch {
    return false;
  }
}

/** true, если IP входит в один из документированных диапазонов ЮKassa —
 * включая IPv6 (2a02:5180::/32), который раньше здесь не проверялся
 * вообще (баг: функция сравнения всегда возвращала false для IPv6, из-за
 * чего реальные вебхуки с IPv6-адресов ЮKassa отклонялись как чужие —
 * платёж проходил на стороне ЮKassa, а сайт об этом не узнавал). */
export function isYooKassaIp(ip: string): boolean {
  return YOOKASSA_IP_RANGES.some((range) => isIpInCidr(ip, range));
}
