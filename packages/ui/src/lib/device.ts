import type { DeviceInfo } from '@repo/contracts';

/**
 * A coarse description of this device for the session list (Gate D.1): its kind, platform and browser
 * family. Never the full user-agent string, a version or anything that fingerprints the person.
 */
export function describeDevice(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): DeviceInfo {
  const platform: DeviceInfo['platform'] = /Android/i.test(ua) ? 'android' : /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Windows/i.test(ua) ? 'windows' : /Mac OS X|Macintosh/i.test(ua) ? 'macos' : /Linux/i.test(ua) ? 'linux' : 'other';
  const kind: DeviceInfo['kind'] = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'phone' : 'desktop';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return { kind, platform, browser };
}
