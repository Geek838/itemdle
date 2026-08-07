# ITEMDLE - Guess the Build

ITEMDLE is a League of Legends guessing game where you identify the 6 core items in a champion's most commonly built item set. After finding all 6 items, unlock the bonus round to arrange them in the correct purchase order!

## Features

- **Daily Challenge**: One champion per day, same for everyone
- **Unlimited Mode**: Endless random champions
- **Bonus Round**: Arrange found items in the correct purchase order
- **Live Patch Data**: Auto-synced with the latest League of Legends patch via Data Dragon
- **Offline Cache**: Fallback to cached patch data when online
- **Statistics**: Track your wins, streak, and best scores
- **Share Results**: Copy your results to share with friends

## How to Play

1. A champion is shown
2. Guess the 6 items of their most commonly built item set (the community core build)
3. Receive feedback:
   - **CORE ITEM** (green): This item is part of the champion's top-6 build
   - **SITUATIONAL** (orange): Hot pick, but just outside the core 6 - close!
   - **NOT BUILT** (red): Rarely built on this champion
4. Find all 6 core items to unlock the Bonus Round
5. **Bonus Round**: Arrange the 6 found items in the exact order they are most commonly purchased

## Game Modes

### Daily Challenge
- One champion per day, same for everyone
- Share your results and compete with friends
- Track your daily streak

### Unlimited Mode
- Endless random champions
- Perfect for practicing
- No time limits

## Installation

ITEMDLE is a web-based game. Simply open `index.html` in a modern web browser.

### Requirements

- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection (for live patch data)
- GitHub Pages or any web hosting (optional)

### Quick Start

```bash
# Clone the repository
git clone git@github.com:Geek838/itemdle.git
cd itemdle

# Open in browser
open index.html
# or on Linux:
xdg-open index.html
```

## Project Structure

```
itemdle/
├── index.html          # Main HTML file
├── README.md           # This file
├── css/
│   └── styles.css      # Game styles
└── js/
    ├── app.js          # Event wiring and boot
    ├── api.js          # Data fetching with offline fallback
    ├── data.js         # Constants, offline cache, curated builds
    ├── game.js         # Game state management and actions
    ├── render.js       # Rendering, search, overlays
    ├── storage.js      # localStorage wrapper
    ├── utils.js        # Helpers, DOM shortcuts, image URLs
    └── confetti.js     # Confetti animation
```

## Technologies Used

- **HTML5, CSS3, JavaScript**: Core web technologies
- **Data Dragon API**: Riot Games' official data API for League of Legends
- **Fontsource**: Google Fonts via CDN
- **No frameworks**: Pure vanilla JavaScript

## Data Sources

- **Champion & Item Data**: [Riot Games Data Dragon](https://ddragon.leagueoflegends.com)
- **Community Builds**: Curated from community sources in the style of LoLalytics

## Credits

- **Game Concept**: Inspired by Wordle and other daily guessing games
- **Data**: Riot Games Data Dragon API
- **Build Curations**: Community sources (LoLalytics style)

## License

This project is a fan-made guessing game and is not affiliated with or endorsed by Riot Games.

Champion & item images © Riot Games (Data Dragon, auto-synced to the latest patch · offline cache as fallback).

League of Legends and all related assets are trademarks of Riot Games, Inc.

## Support

For issues or feature requests, please open an issue on the GitHub repository.
