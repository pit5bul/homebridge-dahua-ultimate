import { API } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { DahuaPlatform } from './platform';

/**
 * Register the platform with Homebridge
 */
export default (api: API): void => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, DahuaPlatform);
};
