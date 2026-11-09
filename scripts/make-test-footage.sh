#!/usr/bin/env bash
# Builds the proof footage: 120 s with three action bursts and one loud decoy,
# a silent copy, and a 20-minute loop.
set -euo pipefail
OUT="${1:-test/fixtures}"
mkdir -p "$OUT/seg"
S=1280x720; R=30
V="-c:v libx264 -preset veryfast -pix_fmt yuv420p -r $R -g 60"
A="-c:a aac -ar 48000 -ac 2 -b:a 128k"
calm() { ffmpeg -y -v error -f lavfi -i "color=c=0x1d2a3a:s=$S:r=$R,noise=alls=6:allf=t" \
  -f lavfi -i "anoisesrc=color=pink:amplitude=0.04:r=48000" -t "$2" $V $A "$OUT/seg/$1.mp4"; }
burst() { ffmpeg -y -v error -f lavfi -i "testsrc2=s=$S:r=$R,drawbox=x='mod(t*900\,1000)':y='200+120*sin(t*7)':w=280:h=280:color=0xff7a00:t=fill,eq=brightness='if(lt(mod(t\,0.6)\,0.1)\,0.55\,0)':eval=frame" \
  -f lavfi -i "aevalsrc='0.9*sin(2*PI*900*t)*lt(mod(t\,0.13)\,0.012)+0.5*sin(2*PI*180*t)*lt(mod(t\,0.5)\,0.05)':s=48000" \
  -f lavfi -i "anoisesrc=color=pink:amplitude=0.04:r=48000" -filter_complex "[1:a][2:a]amix=inputs=2:normalize=0[a]" \
  -map 0:v -map "[a]" -t "$2" $V $A "$OUT/seg/$1.mp4"; }
decoy() { ffmpeg -y -v error -f lavfi -i "color=c=0x404048:s=$S:r=$R" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000,volume=6" -t "$2" $V $A "$OUT/seg/$1.mp4"; }
calm c1 20; burst b1 4; calm c2 21; decoy d1 4; calm c3 15; burst b2 5; calm c4 31; burst b3 4; calm c5 16
: > "$OUT/seg/list.txt"
for s in c1 b1 c2 d1 c3 b2 c4 b3 c5; do echo "file '$s.mp4'" >> "$OUT/seg/list.txt"; done
ffmpeg -y -v error -f concat -safe 0 -i "$OUT/seg/list.txt" $V $A "$OUT/test120.mp4"
ffmpeg -y -v error -i "$OUT/test120.mp4" -c:v copy -an "$OUT/test120-silent.mp4"
ffmpeg -y -v error -stream_loop 9 -i "$OUT/test120.mp4" -c copy "$OUT/test20min.mp4"
rm -rf "$OUT/seg"
for f in test120 test120-silent test20min; do
  echo "$f: $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$f.mp4")s"
done
