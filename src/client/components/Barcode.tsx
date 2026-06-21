const CODE39: Record<string, string> = {
  "0": "000110100", "1": "100100001", "2": "001100001", "3": "101100000",
  "4": "000110001", "5": "100110000", "6": "001110000", "7": "000100101",
  "8": "100100100", "9": "001100100", "A": "100001001", "B": "001001001",
  "C": "101001000", "D": "000011001", "E": "100011000", "F": "001011000",
  "G": "100000011", "H": "001000011", "I": "101000010", "J": "000010011",
  "K": "100001100", "L": "001001100", "M": "101001000", "N": "000011100",
  "O": "100011000", "P": "001011000", "Q": "000000111", "R": "100000110",
  "S": "001000110", "T": "000010110", "U": "110000001", "V": "011000001",
  "W": "111000000", "X": "010010001", "Y": "110010000", "Z": "011010000",
  "-": "010000101", ".": "110000100", " ": "011000100", "*": "010010100",
};

const QZ = 12;

// A real barcode must be dark bars on a light field to scan, regardless of UI
// theme — so these two are intentionally fixed (not sig- tokens that flip).
const FIELD = "#f4f6fb";
const BAR = "#0a0d14";

type Props = {
  readonly value: string;
  readonly className?: string;
};

export function Barcode({ value, className = "" }: Props) {
  const data = `*${value.toUpperCase()}*`;
  const bars: { x: number; w: number }[] = [];
  let x = QZ;
  for (const ch of data) {
    const pat = CODE39[ch];
    if (!pat) continue;
    for (let e = 0; e < 9; e++) {
      const w = pat[e] === "1" ? 3 : 1;
      if (e % 2 === 0) bars.push({ x, w });
      x += w;
    }
    x += 1;
  }
  const total = x - 1 + QZ;

  return (
    <svg
      viewBox={`0 0 ${total} 30`}
      preserveAspectRatio="none"
      className={`block ${className}`}
      role="img"
      aria-label={`Barcode ${value}`}
    >
      <rect x={0} y={0} width={total} height={30} fill={FIELD} />
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={30} fill={BAR} />
      ))}
    </svg>
  );
}
