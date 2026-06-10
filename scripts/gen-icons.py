#!/usr/bin/env python3
"""Generate Vaibes app icons (Wave Arcs + Drop, mint on dark) via cairosvg."""
import cairosvg, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "images")
MINT = "#63E6BE"
DARK = "#0a0a0a"

def logo(scale=1.0, cx=50, cy=58):
    # drop + 3 spreading arcs, centered, `scale` shrinks toward center for padding
    def s(v, c):
        return c + (v - c) * scale
    return f'''
      <ellipse cx="{cx}" cy="{s(26,cy)}" rx="{3.6*scale}" ry="{5.4*scale}" fill="{MINT}"/>
      <path d="M {s(16,cx)} {s(58,cy)} A {34*scale} {34*scale} 0 0 0 {s(84,cx)} {s(58,cy)}" stroke="{MINT}" stroke-width="{3*scale}" stroke-opacity="0.2" fill="none" stroke-linecap="round"/>
      <path d="M {s(26,cx)} {s(58,cy)} A {24*scale} {24*scale} 0 0 0 {s(74,cx)} {s(58,cy)}" stroke="{MINT}" stroke-width="{3*scale}" stroke-opacity="0.42" fill="none" stroke-linecap="round"/>
      <path d="M {s(36,cx)} {s(58,cy)} A {14*scale} {14*scale} 0 0 0 {s(64,cx)} {s(58,cy)}" stroke="{MINT}" stroke-width="{3.5*scale}" stroke-opacity="0.74" fill="none" stroke-linecap="round"/>
    '''

def svg_full(bg, scale=1.0):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">
      <rect width="100" height="100" fill="{bg}"/>{logo(scale)}</svg>'''

def svg_transparent(scale=1.0):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">{logo(scale)}</svg>'''

def render(svg, name, size=1024):
    path = os.path.join(OUT, name)
    cairosvg.svg2png(bytestring=svg.encode(), write_to=path, output_width=size, output_height=size)
    print("wrote", name)

# iOS + base icon: full-bleed dark, logo slightly inset
render(svg_full(DARK, scale=0.82), "icon.png")
# Splash mark: transparent, used small (imageWidth 76)
render(svg_transparent(scale=1.0), "splash-icon.png")
# Android adaptive foreground: transparent, ~62% safe zone (avoid mask crop)
render(svg_transparent(scale=0.62), "android-icon-foreground.png")
# Android monochrome (themed icons): same shape, white
render(svg_transparent(scale=0.62).replace(MINT, "#ffffff"), "android-icon-monochrome.png")
print("done")
