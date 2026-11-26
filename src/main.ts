import { App } from './app';
import { PIECES } from './engine/pieces';
import { renderAppIcon, renderLaunch, renderShareCard } from './ui/art';

const app = new App();
// Handles for automated play-testing and the console.
Object.assign(window, { __bloq: app, __bloqPieces: PIECES, __bloqArt: { renderAppIcon, renderLaunch, renderShareCard } });
