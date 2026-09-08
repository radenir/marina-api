// Marina ship-wheel logo. Uses the real app asset (public/marina-logo.png).
import { Img, staticFile } from 'remotion';

export const Logo: React.FC<{ size: number; style?: React.CSSProperties }> = ({
  size,
  style,
}) => (
  <Img
    src={staticFile('marina-logo.png')}
    style={{ width: size, height: size, objectFit: 'contain', ...style }}
  />
);
