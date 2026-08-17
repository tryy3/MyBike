# Component category icons — detailed set

A more detailed, 64×64 companion to the simple icons in `../categories/`. Same category ids, redrawn with more mechanical detail (teeth, bolts, cable housings, bearing rings, tread, etc.) rather than just scaled up. Not wired into the UI yet.

| id | file | label |
| --- | --- | --- |
| frame | `frame.svg` | Frame |
| fork | `fork.svg` | Fork |
| headset | `headset.svg` | Headset |
| handlebar | `handlebar.svg` | Handlebar |
| stem | `stem.svg` | Stem |
| bar-tape | `bar-tape.svg` | Bar tape / Grips |
| shift-levers | `shift-levers.svg` | Shift levers |
| brake-levers | `brake-levers.svg` | Brake levers |
| front-derailleur | `front-derailleur.svg` | Front derailleur |
| rear-derailleur | `rear-derailleur.svg` | Rear derailleur |
| crankset | `crankset.svg` | Crankset |
| bottom-bracket | `bottom-bracket.svg` | Bottom bracket |
| cassette | `cassette.svg` | Cassette |
| chain | `chain.svg` | Chain |
| brakes | `brakes.svg` | Brakes |
| front-wheel | `front-wheel.svg` | Front wheel |
| rear-wheel | `rear-wheel.svg` | Rear wheel |
| hubs | `hubs.svg` | Hubs |
| rims | `rims.svg` | Rims |
| spokes | `spokes.svg` | Spokes |
| front-tire | `front-tire.svg` | Front tire |
| rear-tire | `rear-tire.svg` | Rear tire |
| saddle | `saddle.svg` | Saddle |
| seatpost | `seatpost.svg` | Seatpost |
| pedals | `pedals.svg` | Pedals |
| other | `other.svg` | Other |

Style: `viewBox="0 0 64 64"`, `stroke="currentColor"`, `fill="none"`, `stroke-width="2"`, round caps/joins — plus filled (`fill="currentColor"`) accents for bolts, teeth, and rivets. Inherits text color and can be recolored via CSS wherever it's eventually used.

Notable clarity fixes over the simple set: `bar-tape` shows an actual candy-cane wrap with a solid finishing band, `cassette` is a cascade of overlapping toothed cogs (increasing in size toward the hub) instead of a stepped line graphic, and `brakes` shows a rotor with cooling vents plus a caliper straddling the edge with visible pads.
