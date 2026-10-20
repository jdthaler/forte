# a toggle for every group of controls, and the controls beside or below the views

### Forte (minor)
- **Every group of controls has a toggle,** in a row at the top of the Controls panel: a tap shows or
  hides that group in the Controls panel, in place of folding it. Every group is on at first,
  each page remembers which are on, and a group added later gets a toggle of its own.
- **The Controls panel beside the views or below them:** a switch in the top bar (on wide
  screens) puts the groups in a column beside the views, as before, or side by side below them.
  The choice holds on every page. Tablets and phones always put them below the views, where the
  views and the controls scroll together; on a phone each row of toggles slides sideways.
- **More controls is for Perform:** Discover has the toggles, and Perform hides the toggles and
  the panel until More controls brings the panel back.
- `tools/check-pages.mjs` flips every group's toggle as it does the views', and on the desktop
  tries the switch both ways.
