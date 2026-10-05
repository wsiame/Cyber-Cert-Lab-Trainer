import { describe, expect, it } from 'vitest';
import { calculateSubnet } from './subnet';

describe('calculateSubnet', () => {
  it('calculates a /27 subnet', () => {
    expect(calculateSubnet('192.168.10.34', 27)).toMatchObject({
      mask: '255.255.255.224',
      network: '192.168.10.32',
      broadcast: '192.168.10.63',
      firstUsable: '192.168.10.33',
      lastUsable: '192.168.10.62',
      usableHosts: 30
    });
  });

  it('calculates a /24 subnet', () => {
    expect(calculateSubnet('10.4.8.99', 24)).toMatchObject({
      mask: '255.255.255.0',
      network: '10.4.8.0',
      broadcast: '10.4.8.255',
      usableHosts: 254
    });
  });
});
