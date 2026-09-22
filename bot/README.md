# Roblox Pilot

A desktop app that watches your screen and plays for you. Pick a game from the
menu, pick a role, press Start.

The first one written is a **goalkeeper for [RANKED!] Illegal Soccer**.

It plays the way you do: it looks at the screen, works out where the ball is,
and presses keys. It does not read Roblox's memory, inject anything into the
game, or touch any file the game owns — it is a screen reader and a keyboard.

---

## Before you start

Automating a ranked multiplayer game is against the Roblox Terms of Service,
and using it against real opponents can get the account banned. It is worth
pointing a private server at it rather than a ranked queue.

---

## Install

You need **Python 3.10 or newer** on the machine that runs Roblox.

```bash
cd bot
pip install -r requirements.txt
python run.py --check     # says what is installed and what is missing
python run.py             # opens the launcher
```

`--check` is the thing to run first when something does not work. It names the
missing piece instead of leaving you guessing:

```
  OK    numpy    installed  (frame maths)
  OK    cv2      installed  (ball detection)
  OK    mss      installed  (screen capture)
  OK    tkinter  installed  (the launcher window)
  OK    input    windows
  OK    screens  1 found
```

If `input` says `dry`, the bot will decide what to press but nothing will be
sent — on Windows it should say `windows`.

---

## Playing a match

1. Open Roblox and get into a match **as goalkeeper**.
2. Open the pilot, choose *[RANKED!] Illegal Soccer* → *Goalkeeper*.
3. Check the controls (below) match your binds.
4. Press **Start**, then click back into Roblox.

The bot only sends input while Roblox is the window in front, so clicking away
to check something parks it automatically. Two keys work from inside the game:

| Key | What it does |
| --- | --- |
| **F8** | Pause and resume |
| **F9** | Panic stop — drops every key immediately |

The panel shows what the bot is seeing while it plays: the frame with the ball
ringed, an arrow for where it thinks the ball is going, and the state it is in
(`hold line`, `set`, `dive`, `claim`…). If the ball ring is not tracking the
real ball, that is what to fix first — see *Calibrating* below.

---

## Controls

Taken from the in-game keybind screens:

| Action | Default | Used by the keeper |
| --- | --- | --- |
| Move | `W` `A` `S` `D` | Shuffling across the goal, rushing out |
| Sprint | `Shift` | Coming for a loose ball |
| Jump | `Space` | High balls |
| **Punch** | Left click | Shots it can reach standing up |
| **Dive** | Right click | Shots it cannot |
| **Lob** | `F` | Clearing upfield once it has the ball |
| **Request** | `R` | Calling for the ball |

**The two mouse buttons are a guess.** The keeper HUD shows Punch and Dive as
mouse buttons but not which is which. If the keeper punches when it should be
diving, open **Settings → Controls**, click the row, press the real button.
Everything else on that screen is rebindable the same way.

---

## Calibrating

Three things to check, in the order that matters.

**1. Is it seeing the ball?** Start the bot and watch the preview. The ring
should sit on the ball. If it latches onto a shirt or the goal net instead, the
colour profile needs adjusting for your map's lighting — the defaults assume a
bright, washed-out ball. The `vision` block in the config file holds `hsv_low`
and `hsv_high`.

**2. Where is your goal?** Settings → Keeper has *Keeper position*, *Goal
line*, and the two posts. These say where on the frame your player stands and
how wide it may stray. The preview draws them, so nudge until they line up with
the real goal.

**3. How eagerly should it commit?** *Dive timing* is how long before impact it
goes; *Shot sensitivity* is how fast the ball has to be closing to count as a
shot at all. Diving at nothing means the sensitivity is too low. Getting beaten
without moving means it is too high.

Settings save as you change them. **Reset this game to defaults** puts
everything back.

---

## How it works

Three pieces, one loop, thirty times a second:

```
screen ──► find the ball ──► track it ──► decide ──► press keys
           (colour+shape+   (velocity,   (keeper
            motion)          growth)      brain)
```

**Finding it.** The ball is small, bright, round and moving, and each of those
is a filter. Candidates are scored rather than accepted outright, so a ball
crossing a white kit degrades to a worse score instead of vanishing.

**Tracking it.** One detection is a guess. A short history is fitted with least
squares to get position and velocity, which rides out jitter, and a dropped
frame coasts on the last velocity instead of freezing. A sighting that moved
further than a ball plausibly could is rejected.

**Deciding.** The ball's *apparent radius* is the only depth cue a screen
reader gets: a ball swelling fast is a ball coming at you. The keeper works out
when it will arrive and where it will cross the line, then:

| Situation | What it does |
| --- | --- |
| Ball upfield | Shadows it along the line, never past the posts |
| Ball in the box | Stays set, small steps, no commitment |
| Shot arriving, reachable | Punches it clear |
| Shot arriving, out of reach | Dives that way |
| Loose ball at its feet | Sprints out and claims it |
| Ball held | Lobs it upfield |
| Ball lost | Sweeps the camera to find play |

It commits late on purpose — a keeper that dives early is a keeper that gets
lobbed — and will not dive twice inside the cooldown.

Every threshold is a fraction of the frame, so one set of numbers works at
1080p and 1440p alike.

---

## Adding another game or role

`pilot/games/registry.py` lists what the menu shows. A role points at a
function that builds a brain — anything with `decide(ball, now, frame)`
returning an `Action`, and `reset()`. The runtime, the UI and the settings
screen need no changes.

```
pilot/
├── core/       config, capture, input, tracking, geometry, the loop
├── vision/     finding the ball
├── games/      one folder per game: keymap + brain
└── ui/         launcher, panel, settings, preview
```

---

## Tests

```bash
cd bot
python -m unittest discover -s tests -t .
```

112 tests covering the geometry, the tracker, every keeper decision, the input
controller and an end-to-end run of the whole loop against synthetic frames.
The vision tests skip themselves if OpenCV is not installed.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `input  dry` in `--check` | No backend. On Windows this is a bug; elsewhere `pip install pynput` |
| Nothing happens in game | Roblox is not the focused window, or F8 has it paused |
| Keeper dives at nothing | *Shot sensitivity* too low |
| Keeper never moves | It cannot see the ball — check the preview ring |
| Keeper drifts off the goal | Posts and *Keeper position* need calibrating |
| `No module named tkinter` | Linux: `apt install python3-tk` |
| Camera spins | Turn down *Camera speed*, or switch camera control off |
