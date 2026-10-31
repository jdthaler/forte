# no fade at the top of the iPhone home-screen app

### Forte (patch)
- **No fade at the top of the home-screen app on iPhone:** iOS 26 and later still faded the top
  of the page into a haze below a solid status bar, because nothing was pinned to the top of the
  page. Every page now starts with an invisible bar pinned there, in the colour of its header,
  and WebKit extends that colour under the status bar instead of drawing the haze.
