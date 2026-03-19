import { MapPin, ExternalLink, type LucideIcon } from "lucide-react";

export function IsoBtn({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-1.5 py-1 rounded text-[11px] font-mono tracking-wider transition-colors border shrink-0 ${
        active
          ? "text-sig-accent bg-sig-accent/15 border-sig-accent/40"
          : "text-sig-dim bg-transparent border-sig-grid/50 hover:text-sig-text"
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

export function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs text-sig-accent tracking-widest mb-1.5 border-b border-sig-grid/40 pb-0.5">
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function Row({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  if (!value || value === "UNKNOWN" || value === "Unknown") return null;
  return (
    <div className="flex justify-between text-sm gap-2">
      <span className="text-sig-dim shrink-0">{label}</span>
      <span className="text-sig-text text-right truncate font-mono">
        {value}
      </span>
    </div>
  );
}

export function RouteAirport({
  apt,
}: {
  readonly apt: { iata?: string; icao?: string; name?: string };
}) {
  const code = apt.iata || apt.icao || "???";
  return (
    <div className="flex items-center gap-1">
      <MapPin className="w-3 h-3 text-sig-dim" />
      <span className="font-mono text-sig-bright">{code}</span>
    </div>
  );
}

export function formatEpoch(epoch: number): string {
  const d = new Date(epoch * 1000);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

export function LinkRow({
  label,
  href,
}: {
  readonly label: string;
  readonly href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between text-sm text-sig-accent hover:text-sig-bright transition-colors py-0.5"
    >
      <span>{label}</span>
      <ExternalLink className="w-3 h-3 shrink-0" />
    </a>
  );
}

// ── MMSI country code ────────────────────────────────────────────────

export function mmsiCountry(mmsi: number): string | null {
  const mid = Math.floor(mmsi / 1_000_000);
  const m: Record<number, string> = {
    201: "AL",
    202: "AD",
    203: "AT",
    204: "PT",
    205: "BE",
    206: "BY",
    207: "BG",
    209: "CY",
    210: "CY",
    211: "DE",
    212: "CY",
    213: "GE",
    214: "MD",
    215: "MT",
    216: "AM",
    218: "DE",
    219: "DK",
    220: "DK",
    224: "ES",
    225: "ES",
    226: "FR",
    227: "FR",
    228: "FR",
    229: "MT",
    230: "FI",
    231: "FO",
    232: "GB",
    233: "GB",
    234: "GB",
    235: "GB",
    236: "GI",
    237: "GR",
    238: "HR",
    239: "GR",
    240: "GR",
    241: "GR",
    242: "MA",
    243: "HU",
    244: "NL",
    245: "NL",
    246: "NL",
    247: "IT",
    248: "MT",
    249: "MT",
    250: "IE",
    251: "IS",
    253: "LU",
    255: "PT",
    256: "MT",
    257: "NO",
    258: "NO",
    259: "NO",
    261: "PL",
    263: "PT",
    264: "RO",
    265: "SE",
    266: "SE",
    267: "SK",
    269: "CH",
    270: "CZ",
    271: "TR",
    272: "UA",
    273: "RU",
    275: "LV",
    276: "EE",
    277: "LT",
    278: "SI",
    279: "ME",
    303: "US",
    306: "CW",
    307: "AW",
    308: "BS",
    310: "BM",
    312: "BZ",
    314: "BB",
    316: "CA",
    319: "KY",
    321: "CR",
    323: "CU",
    325: "DM",
    327: "DO",
    330: "GD",
    331: "GL",
    332: "GT",
    334: "HN",
    336: "HT",
    338: "US",
    339: "JM",
    345: "MX",
    350: "NI",
    351: "PA",
    352: "PA",
    353: "PA",
    354: "PA",
    355: "PA",
    356: "PA",
    357: "PA",
    358: "PR",
    359: "SV",
    362: "TT",
    366: "US",
    367: "US",
    368: "US",
    369: "US",
    370: "PA",
    371: "PA",
    372: "PA",
    373: "PA",
    374: "PA",
    401: "AF",
    403: "SA",
    405: "BD",
    410: "BT",
    412: "CN",
    413: "CN",
    414: "CN",
    416: "TW",
    417: "LK",
    419: "IN",
    422: "IR",
    425: "IQ",
    428: "IL",
    431: "JP",
    432: "JP",
    436: "KZ",
    438: "JO",
    440: "KR",
    441: "KR",
    447: "KW",
    450: "LB",
    457: "MN",
    461: "OM",
    463: "PK",
    466: "QA",
    468: "SY",
    470: "AE",
    473: "YE",
    475: "TH",
    477: "HK",
    501: "AQ",
    503: "AU",
    506: "MM",
    512: "NZ",
    525: "ID",
    533: "MY",
    538: "MH",
    548: "PH",
    553: "PG",
    563: "SG",
    564: "SG",
    565: "SG",
    566: "SG",
    574: "VN",
    576: "VU",
    601: "ZA",
    603: "AO",
    605: "DZ",
    622: "EG",
    624: "ET",
    626: "GA",
    627: "GH",
    634: "KE",
    636: "LR",
    637: "LR",
    657: "NG",
    659: "NA",
    672: "TN",
    674: "TZ",
    675: "UG",
    678: "ZM",
    679: "ZW",
  };
  return m[mid] ?? null;
}
