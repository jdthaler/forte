# no more backward compatibility before 1.0

### Forte (patch)
- **The five oldest pages keep their settings where every other page does:** the Ribbon Piano, Tonewheel Organ, Tine Piano, Black-Hole Keyboard and Huygens Keyboard now save to `forte/<id>/params/v1` instead of the names they had before the shared page code, so each starts once from its defaults (and the Combinations page reads them the same way as the rest).
