import { App } from './app';
import { PIECES } from './engine/pieces';
import { greedyPlan } from './engine/sim';
import { drawBlock, paintEmptyCell, setBlockStyle, setRenderScale } from './render/blocks';
import { drawBloqMark, renderAppIcon, renderDailyShareCard, renderLaunch, renderShareCard } from './ui/art';

const app = new App();
// Handles for automated play-testing and the console.
Object.assign(window, { __bloq: app, __bloqPieces: PIECES, __bloqSim: { greedyPlan }, __bloqArt: { drawBloqMark, renderAppIcon, renderLaunch, renderShareCard, renderDailyShareCard }, __bloqBlocks: { drawBlock, paintEmptyCell, setBlockStyle, setRenderScale } });
