# Hide and Seek Chicks
Interactive HTML Educational Game

Goal:
Help students learn **counting and subtraction** by observing animated chicks moving between zones or hiding behind flowers.

Game runs entirely in browser using:

HTML + CSS + JavaScript

No backend required.

---

# 1. Project Folder Structure

Project root:

.
├── hide_and_seek_chicks.html
├── todo.md
├── audio/
│   └── rooster_crow.mp3
└── chick/
    ├── B-Front.png
    ├── B-Front-Flap.png
    ├── B-Left.png
    ├── B-Right.png
    ├── Y-Front.png
    ├── Y-Front-Flap.png
    ├── Y-Left.png
    ├── Y-Right.png
    ├── Blue_Flower.png
    ├── Red_Flower.png
    └── Yellow_Flower.png

All images are:

1000x1000 PNG  
transparent background  
must preserve 1:1 ratio

---

# 2. Display Requirements

Game must run on:

• Smart TV  
• Laptop  
• Tablet  
• Mobile (landscape)

The **game zone fills the entire screen**.

Use responsive layout.

Disable accidental zoom on touch devices.

HTML viewport:

<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">

CSS:

touch-action: manipulation;

---

# 3. Screen Layout

Game layout:

--------------------------------
|                            ⚙ UI   |
|                              |
|                              |
|                      GAMEZONE   |
|                              |
|                              |
|------------------------------|
| Status bar                   |
--------------------------------

Gamezone:

• contains chicks
• zones or brushes
• animations

Top-right:

floating control buttons in one row.

Bottom:

status information bar

Background must be white.

---

# 4. UI Controls

Floating UI buttons (top-right):

⚙ Settings  
▶ Start  
⏸ Pause  
🔄 Reset  
🎮 Switch Mode  
🐤 Chick Count  
⚡ Speed Level  
⏱ Timer  
🌑 Black Chick Mode  
🌼 Brush Count  

Buttons may use emoji or icons.

Panel should have only one row.

---

# 5. Bottom Status Bar

Display:

🐤 chick count  
⚡ speed level  
🌑 black chick mode  
🎮 current mode  
⏱ timer

Each item clickable to toggle number visibility.

Example:

🐤 6

Click → hide number

Used by teachers to hide answers.

---

# 6. Chick Asset Types

Yellow Chick:

Y-Front.png  
Y-Front-Flap.png  
Y-Left.png  
Y-Right.png  

Black Chick:

B-Front.png  
B-Front-Flap.png  
B-Left.png  
B-Right.png  

Animation states:

front idle  
left walking  
right walking  
front flap celebrate

Switch animation randomly every:

2–5 seconds

---

# 7. Chick Object Model

Each chick has:

id  
color  
x  
y  
velocityX  
velocityY  
direction  
state  
speed  
target  
hidden  

Example object:

{
 id:1,
 color:"yellow",
 x:300,
 y:400,
 direction:"front",
 state:"wander",
 speed:3,
 hidden:false
}

---

# 8. Chick Count Rules

Maximum chicks:

20

Default:

6

---

# 9. Black Chick Mode Rule

When black chick mode is enabled:

Total chicks split between yellow and black.

Rules:

If total is EVEN:

black = yellow

If total is ODD:

yellow = black + 1

Examples:

Total 6 → 3 yellow + 3 black  
Total 8 → 4 yellow + 4 black  
Total 5 → 3 yellow + 2 black  
Total 7 → 4 yellow + 3 black  

This keeps yellow equal or slightly more.

---

# 10. Chick Movement Behavior

Chicks behave like playful animals.

Movement types:

wander  
run  
chase  
group move  
hide  

Each chick has slightly random speed.

Speed level range:

1–10

Example speeds:

1 very slow  
3 default  
10 extremely fast

Movement updated with:

requestAnimationFrame

---

# 11. Random Idle Animations

Every 2–5 seconds a chick randomly:

turn left  
turn right  
flap wings  
pause

Adds life to game.

---

# 12. Zone System (Mode 1)

Zones are colored areas where chicks gather.

Default zones:

Red  
Blue

Optional:

Yellow zone

Zones should occupy large visible area.

Zones must scale dynamically based on chick count.

Zones must in center screen.

---

# 13. Zone Packing Algorithm

When chicks run to zones:

They must **not overlap excessively**.

Use simple grid placement inside zone.

Example:

1 zone with 12 chicks

Arrange rows:

● ● ● ●  
● ● ● ●  
● ● ● ●

Spacing based on zone size.

---

# 14. Mode 1 — Count the Chicks

Purpose:

Students count chicks quickly.

---

## Start State

Chicks line up at bottom of screen.

Easy to count.

---

## Play Phase

Timer begins.

Chicks wander randomly.

Animations active.

---

## Timer End Event

When timer reaches 0:

Play rooster crow sound.

All chicks run quickly to nearest zone.

Distribution random.

Example:

6 chicks

2 red  
4 blue

Students count.

---

# 15. Mode 2 — Hide in the Brush

Purpose:

Teach subtraction.

Students infer hidden numbers.

---

# 16. Brush Objects

Brush images:

Red_Flower.png  
Blue_Flower.png  
Yellow_Flower.png  

Chicks hide behind them. Bursh must big, like zone in first mode.

Brush count:

2 or 3

Default:

2

---

# 17. Group Formation

At start:

Chicks divide into brush groups randomly.

Example:

6 chicks  
2 brushes

Possible:

3 + 3  
4 + 2

Chicks move to brush front.

Wait 5 seconds.

Then hide behind brush.

---

# 18. Hidden Chick Logic

Hidden chicks:

hidden = true

Not visible.

Position stored behind brush.

---

# 19. Switching Events

While timer running:

Random events move chicks between brushes.

Event probability:

every 3–8 seconds

Possible events:

1 chick switches  
2 chicks swap  
delayed chase

Students see chick running between brushes.

Then chick hides again.

---

# 20. Timer End Behavior

Timer reaches zero:

Play rooster crow.

Stop all switching.

Teacher can click brush to reveal chicks.

---

# 21. Reveal Animation

When brush clicked:

Grass bounce  
Grass fly up  
Grass shrink

Hidden chicks appear.

Students calculate:

Total − visible.

Teacher then reveals remaining brushes.

---

# 22. Celebration Animation

After reveal:

All chicks celebrate.

Chip sound.

Animation:

jump  
wing flap  
spin slightly

Duration:

3 seconds

---

# 23. Sound System

Audio files:

audio/rooster_crow.mp3

Timer end sound.

chip chip (chick move)  sfx
celebration chirp sfx

---

# 24. Timer System

Timer visible in bottom bar.

Counts down.

When reaches zero:

Play rooster sound.

Call mode-specific logic.

Example code:

function onTimerEnd(){

 roosterSound.play();

 if(gameMode=="count"){
   runChicksToZones();
 }

 if(gameMode=="hide"){
   stopSwitching();
   enableReveal();
 }

}

---

# 25. Interaction

Teacher interaction:

mouse click  
touch tap

Brush click reveals hidden chicks.

---

# 26. Fullscreen Support

Game should support fullscreen.

Example:

document.documentElement.requestFullscreen()

Optional button in settings.

---

# 27. Camera Interaction

Allow mouse drag to pan.

Disable zoom on touch.

---

# 28. Performance Target

Game should handle:

20 chicks  
3 zones  
3 brushes

Target:

60 FPS

---

# 29. JavaScript Architecture

Recommended modules:

GameController  
UIController  
ChickManager  
ZoneManager  
BrushManager  
AnimationManager  
TimerManager  
AudioManager

---

# 30. Game State Example

{
 mode:"count",
 running:true,
 chickTotal:6,
 blackChicks:3,
 yellowChicks:3,
 speed:3,
 timer:30
}

---

# 31. Testing Checklist

Test chick counts:

6  
12  
20

Test black chick rule:

5 → 3Y 2B  
6 → 3Y 3B  
7 → 4Y 3B  
8 → 4Y 4B

Test zones:

19 vs 1  
10 vs 10

Test brushes:

switch events  
swap events

Test devices:

mobile  
tablet  
desktop  
TV

---

# 32. Final Output

File:

hide_and_seek_chicks.html

Must run directly in browser.

Assets loaded from:

./chick  
./audio