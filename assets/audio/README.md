# Audio assets

## `rain-loop.mp3` — optional ambient background

**Source:** "Rain and thunder" by *drericoy (Freesound)*, via Pixabay.
**Licence:** [Pixabay Content License](https://pixabay.com/service/license-summary/)
— free to use, **no attribution required**, modification permitted. Credit is
recorded here anyway because knowing where an asset came from is worth having.

The Pixabay licence forbids redistributing content on a *standalone* basis — i.e.
selling or distributing it substantially as-is, as the product. That is not what
this is: it is processed background audio inside an application.

### How it was made

The source is 12:06 and 14 MB, which is 3.5× the photogrammetry room that is
deliberately hidden behind `?scan` — far too heavy to ship, and the wrong shape
for a loop, because a thunderclap recurring every 60 seconds is maddening.

So the window was chosen by measurement, not by ear. Low-frequency energy
(`lowpass=150Hz`) finds thunder, since a clap is a sub-200Hz rumble while rain is
broadband. Sampling the file in 60-second windows:

| window | LF max |
|---|---|
| 0s–360s | −2.5 to −7.3 dB (thunder) |
| **420s** | **−21.1 dB** (clean) |
| 480s+ | −3.1 dB (thunder) |

`420s` is ~14 dB below every other window — a full minute of rain with no strike
in it. Finer 15-second slices confirmed the whole 420–485s stretch stays clean,
while 405s shows a thunder tail at −11.8 dB.

The loop is then built so the seam is continuous: 65 seconds are taken, the first
60 are faded in over 5s, the trailing 5 are faded out and mixed onto the head. At
the seam the outgoing and incoming material sum to the same signal, so it wraps
without a click. Measured head −17.2 dB against tail −19.9 dB — a 2.7 dB
difference, comfortably inside rain's own ±6 dB variation.

```bash
ffmpeg -ss 420 -t 65 -i source.mp3 -filter_complex \
  "[0:a]atrim=0:60,asetpts=N/SR/TB,afade=t=in:st=0:d=5[x];\
   [0:a]atrim=60:65,asetpts=N/SR/TB,afade=t=out:st=0:d=5[y];\
   [x][y]amix=inputs=2:duration=first:normalize=0[m];\
   [m]loudnorm=I=-18:TP=-2:LRA=11[out]" \
  -map "[out]" -c:a libmp3lame -b:a 64k -ac 2 -ar 44100 rain-loop.mp3
```

**Result: 470 KB, exactly 60.000s** — 3.4% of the original.

### Why it does not violate the "no samples" rule

`js/audio.js` says synthesized only, no samples, CSP-safe. This is the one
exception and it is deliberate: rain is broadband noise with structure that
synthesised noise does not convincingly fake. It is opt-in and fetched lazily on
first switch-on, so a visitor who never wants it downloads nothing. Everything
else in that module is still oscillators and envelopes.
