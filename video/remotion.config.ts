// Remotion CLI render config for the Marina walkthrough video.
// Mirrors the settings used by the marina-ad composition (JPEG frames, overwrite output).
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setEntryPoint('./remotion/index.ts');
