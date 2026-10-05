export type SubnetDetails = {
  ip: string;
  cidr: number;
  mask: string;
  network: string;
  broadcast: string;
  firstUsable: string;
  lastUsable: string;
  usableHosts: number;
};

function ipToNumber(ip: string) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }

  return parts.reduce((total, part) => (total << 8) + part, 0) >>> 0;
}

function numberToIp(value: number) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

export function calculateSubnet(ip: string, cidr: number): SubnetDetails {
  if (!Number.isInteger(cidr) || cidr < 1 || cidr > 32) {
    throw new Error(`Invalid CIDR prefix: ${cidr}`);
  }

  const ipNumber = ipToNumber(ip);
  const maskNumber = cidr === 32 ? 0xffffffff : (0xffffffff << (32 - cidr)) >>> 0;
  const networkNumber = ipNumber & maskNumber;
  const broadcastNumber = networkNumber | (~maskNumber >>> 0);
  const totalAddresses = 2 ** (32 - cidr);
  const usableHosts = cidr >= 31 ? totalAddresses : Math.max(totalAddresses - 2, 0);

  return {
    ip,
    cidr,
    mask: numberToIp(maskNumber),
    network: numberToIp(networkNumber),
    broadcast: numberToIp(broadcastNumber),
    firstUsable: numberToIp(cidr >= 31 ? networkNumber : networkNumber + 1),
    lastUsable: numberToIp(cidr >= 31 ? broadcastNumber : broadcastNumber - 1),
    usableHosts
  };
}
