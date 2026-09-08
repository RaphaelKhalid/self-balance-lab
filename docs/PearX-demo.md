# SelfBalance: an AI invention studio for kids

SelfBalance is built for kids ages 10-14. The creation loop is simple:
describe a little invention, build it from real electronic parts, and change it
to discover what happens.

The shipped studio has a custom 3D kit with a desk fan, battery, motor, lamp,
and readable controls. Its catalog has 17 entries: 16 base component types plus
the desk-fan variant. The circuit solver is real steady-state DC, so current,
LED brightness, motor behavior, shorts, and over-current warnings follow the
wired build.

## A 90-second demo

1. Open **Pocket breeze**. The fan, switch, battery, and power dial are a real
   wired starter build.
2. Turn the power dial down, then switch the circuit off and on. Point out that
   the solved current changes.
3. Press **RUN**. The same creation remains intact while its solved motor
   current drives the motor physics. Return to the bench and keep editing.
4. Open **Little light** (`Light switch`), or ask Hephaestus: "Make a light I can switch on.
   Name it Moon lamp." The assistant can place parts, lay them out, wire them,
   rename the invention, toggle switches, and tune parameters through the same
   validated tools as the interface.
5. Open **Look inside the circuit**, then use Share to copy the build URL.
6. Open **Secret signal** (`Push-button buzzer`) and hold its button. The buzzer sounds while the
   momentary button is held, then stops on release.

The starter builds and manual tools work without AI. Free-form Hephaestus uses
the deployed Vercel proxy with an OpenRouter or Gemini key. A local static
server does not provide that backend. The phone shell exposes the same build,
circuit, assistant, save, share, and RUN workflow on a small touch screen.

## Honest limits

The solver is a steady-state DC model. It does not run general code or blinking
programs, transient or AC behavior, or airflow simulation. RUN is a motor
physics test driven by solved current, not a full articulated robotics
simulator. This demo establishes the shipped creation loop; it does not claim
traction, retention, educational outcomes, or school adoption.

The current verification suite covers 62 browser checks and 10 MCP checks. The
latest pass includes mocked assistant tool loops and browser coverage of the
starter inventions, momentary sound, live controls, RUN persistence, and mobile
layout.
