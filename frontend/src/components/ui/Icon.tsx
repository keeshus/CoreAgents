type IconWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700;
type IconGrade = -50 | -25 | 0 | 25 | 50 | 100 | 200;

interface IconProps {
  name: string;
  className?: string;
  size?: number;
  weight?: IconWeight;
  grade?: IconGrade;
  fill?: boolean;
}

export function Icon({ name, className = '', size, weight, grade, fill }: IconProps) {
  const style: Record<string, string | number> = {};
  if (size) style.fontSize = size;
  if (weight || grade || fill !== undefined) {
    const parts: string[] = [];
    if (fill !== undefined) parts.push(`'FILL' ${fill ? 1 : 0}`);
    if (weight) parts.push(`'wght' ${weight}`);
    if (grade) parts.push(`'GRAD' ${grade}`);
    if (parts.length) style.fontVariationSettings = parts.join(', ');
  }
  return (
    <span className={`material-symbols-outlined ${className}`} style={style}>
      {name}
    </span>
  );
}
