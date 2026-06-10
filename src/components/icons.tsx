import Svg, { Path, G, Rect, Circle, Defs, RadialGradient, Stop, LinearGradient } from 'react-native-svg';

export function AppleIcon({ size = 20, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17.05 12.04c-.03-2.77 2.27-4.1 2.37-4.16-1.29-1.89-3.3-2.15-4.02-2.18-1.71-.17-3.34 1.01-4.21 1.01-.87 0-2.21-.99-3.63-.96-1.87.03-3.59 1.09-4.55 2.76-1.94 3.36-.5 8.34 1.4 11.07.92 1.33 2.02 2.83 3.46 2.78 1.39-.06 1.91-.9 3.59-.9 1.67 0 2.15.9 3.63.87 1.5-.03 2.45-1.36 3.36-2.7 1.06-1.55 1.5-3.05 1.52-3.13-.03-.01-2.91-1.12-2.94-4.46zM14.43 4.18c.76-.93 1.28-2.21 1.14-3.49-1.1.05-2.44.74-3.23 1.66-.7.81-1.32 2.12-1.16 3.36 1.23.1 2.49-.62 3.25-1.53z"
        fill={color}
      />
    </Svg>
  );
}

export function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G>
        <Path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          fill="#4285F4"
        />
        <Path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <Path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          fill="#FBBC05"
        />
        <Path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </G>
    </Svg>
  );
}

export function InstagramIcon({ size = 20, color }: { size?: number; color?: string }) {
  // When `color` set, render monochrome (for use on light pills). Otherwise gradient.
  const stroke = color ?? 'url(#igGrad)';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Defs>
        <RadialGradient id="igGrad" cx="0.3" cy="1" r="1">
          <Stop offset="0" stopColor="#FFD776" />
          <Stop offset="0.35" stopColor="#F3A03F" />
          <Stop offset="0.6" stopColor="#E83D6B" />
          <Stop offset="0.85" stopColor="#C32EA3" />
          <Stop offset="1" stopColor="#7A38C9" />
        </RadialGradient>
      </Defs>
      <Rect x="2.2" y="2.2" width="19.6" height="19.6" rx="5.5" stroke={stroke} strokeWidth={2} />
      <Circle cx="12" cy="12" r="4.2" stroke={stroke} strokeWidth={2} />
      <Circle cx="17.4" cy="6.6" r="1.3" fill={stroke} />
    </Svg>
  );
}

export function TikTokIcon({ size = 20, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16.6 2h-3.2v13.1a2.7 2.7 0 1 1-2.7-2.7c.27 0 .53.04.78.12V9.3a6 6 0 1 0 5.12 5.94V8.5a7.2 7.2 0 0 0 4.1 1.28V6.56a4.1 4.1 0 0 1-4.1-4.1V2z"
        fill={color}
      />
    </Svg>
  );
}
