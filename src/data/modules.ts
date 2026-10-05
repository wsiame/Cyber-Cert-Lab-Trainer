import type { LabStep, LearningModule, SourceModuleId } from '../types';

const maskOctets = [0, 128, 192, 224, 240, 248, 252, 254, 255];

const maskForCidr = (cidr: number) => {
  const fullOctets = Math.floor(cidr / 8);
  const partialBits = cidr % 8;
  return [0, 1, 2, 3]
    .map((octetIndex) => {
      if (octetIndex < fullOctets) return 255;
      if (octetIndex === fullOctets) return maskOctets[partialBits];
      return 0;
    })
    .join('.');
};

const interestingOctetName = (cidr: number) => ['first', 'second', 'third', 'fourth'][Math.min(Math.floor(cidr / 8), 3)];

const subnetDetailsFor = (cidrText?: string): Record<string, string> => {
  const cidr = cidrText ? Number(cidrText) : undefined;
  if (!cidr || Number.isNaN(cidr)) return {};

  const hostBits = 32 - cidr;
  const totalAddresses = 2 ** hostBits;
  const usableHosts = cidr >= 31 ? totalAddresses : Math.max(totalAddresses - 2, 0);
  const partialBits = cidr % 8;
  const mask = maskForCidr(cidr);
  const blockSize = partialBits === 0 ? 256 : 256 - maskOctets[partialBits];

  return {
    CIDR: `/${cidr}`,
    Mask: mask,
    'Host bits': String(hostBits),
    'Total addresses': String(totalAddresses),
    'Usable hosts': String(usableHosts),
    'Block size': String(blockSize),
    'Interesting octet': interestingOctetName(cidr)
  };
};

const inferVisual = (id: string, prompt: string, answer: string): LabStep['visual'] => {
  if (id.startsWith('trunk-')) {
    const vlanLabels = [...new Set([...prompt.matchAll(/VLAN\s*(\d+)/gi)].map((match) => `VLAN ${match[1]}`))];
    const endpoint =
      prompt.includes('router-on-a-stick') ? 'Switch to router-on-a-stick' : prompt.includes('hypervisor') ? 'Switch to hypervisor host' : prompt.includes('desktop PC') ? 'Switch to desktop PC' : 'Switch A to Switch B';
    const nativeVlans = [...prompt.matchAll(/native VLAN is (\d+)/gi)].map((match) => `VLAN ${match[1]}`);
    const isAccessAnswer = answer.toLowerCase().includes('access');
    const missingAllowed = prompt.match(/except VLAN\s+(\d+)|VLAN\s+(\d+)\s+cannot cross|not allowed on the trunk/i);

    return {
      type: 'trunk',
      title: isAccessAnswer ? 'Access link: one endpoint VLAN' : nativeVlans.length ? 'Native VLAN mismatch on trunk' : missingAllowed ? 'Allowed VLAN check on trunk' : 'Trunk link: multiple VLANs',
      labels: vlanLabels.length > 1 ? vlanLabels : isAccessAnswer ? ['VLAN 10'] : ['VLAN 10', 'VLAN 20', 'VLAN 30'],
      details: {
        Endpoints: endpoint,
        'Correct link mode': isAccessAnswer ? 'Access' : 'Trunk',
        'Frame handling': isAccessAnswer ? 'Endpoint traffic is untagged in one VLAN' : '802.1Q tags mark each VLAN',
        'Native VLANs': nativeVlans.length ? nativeVlans.join(' vs ') : 'Must match on both trunk ends',
        'Allowed VLAN focus': vlanLabels.length ? vlanLabels.join(', ') : 'Permit only needed VLANs'
      }
    };
  }

  if (id.startsWith('vlan-')) {
    const vlanMatch = prompt.match(/VLAN\s+(\d+)/i) ?? answer.match(/VLAN\s+(\d+)/i);
    const endpoint =
      prompt.match(/\b(Sales workstation|shared printer|IP phones|security camera|normal user laptop|device|PC|guest Wi-Fi|wall jack)\b/i)?.[0] ??
      'Endpoint';
    const needsRouting = /different VLANs|reach VLAN|another VLAN|inter-VLAN/i.test(prompt);
    return {
      type: 'access-vlan',
      title: needsRouting ? 'Separate VLANs need routing' : 'Access VLAN placement',
      labels: [vlanMatch ? `VLAN ${vlanMatch[1]}` : answer.includes('VLAN') ? answer : 'One access VLAN'],
      details: {
        Endpoint: endpoint,
        'Port mode': answer.toLowerCase().includes('trunk') ? 'Trunk' : 'Access',
        'VLAN assignment': vlanMatch ? `VLAN ${vlanMatch[1]}` : 'One VLAN per access port',
        'Layer 2 boundary': 'Broadcasts stay inside the VLAN',
        'Routing note': needsRouting ? 'Use a router or Layer 3 switch between VLANs' : 'No routing needed inside the same VLAN'
      }
    };
  }

  if (id.startsWith('subnet-')) {
    const cidr = prompt.match(/\/(\d+)/)?.[1];
    const ip = prompt.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/)?.[0];
    return {
      type: 'subnet-range',
      title: 'Subnet range view',
      labels: [ip ? `${ip}${cidr ? `/${cidr}` : ''}` : cidr ? `/${cidr}` : 'Subnet math', answer],
      details: {
        Subject: ip ? `${ip}${cidr ? `/${cidr}` : ''}` : cidr ? `/${cidr}` : 'Sizing question',
        Answer: answer,
        ...subnetDetailsFor(cidr)
      }
    };
  }

  if (id.startsWith('port-')) {
    const protocol =
      prompt.match(/\b(DNS|HTTPS|HTTP|SSH|RDP|DHCP|SNMP|NTP|IMAP|POP3|SMTP|FTP|Telnet|TFTP|LDAP|LDAPS|SMB|Kerberos|BGP|OSPF|RADIUS|Syslog)\b/i)?.[0] ??
      'Service';
    const udpProtocols = ['DNS', 'DHCP', 'SNMP', 'NTP', 'TFTP', 'RADIUS', 'Syslog'];
    const service =
      prompt.match(/\b(resolve|secure website|terminal session|Windows desktop|unencrypted website|client requests|receives replies|polls|trap|syncs time|retrieves email|sends mail|transfers files|directory lookup|file sharing|authentication|accounting)\b/i)?.[0] ??
      'Service request';
    return {
      type: 'port-flow',
      title: `${protocol.toUpperCase()} traffic flow`,
      labels: [protocol.toUpperCase(), `Port ${answer}`],
      details: {
        Service: service,
        Protocol: protocol.toUpperCase(),
        'Destination port': answer,
        Transport: udpProtocols.includes(protocol) ? 'UDP commonly' : protocol.toUpperCase() === 'OSPF' ? 'IP protocol 89' : 'TCP commonly',
        'Client side': 'Ephemeral source port'
      }
    };
  }

  return {
    type: 'generic',
    title: 'Concept view',
    labels: [answer]
  };
};

const seededNumber = (value: string) =>
  [...value].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 2166136261);

const shuffleChoices = (id: string, answer: string, choices: string[]) => {
  const uniqueChoices = [...new Set(choices)];
  const normalizedChoices = uniqueChoices.includes(answer) ? uniqueChoices : [answer, ...uniqueChoices].slice(0, 4);
  const shuffled = [...normalizedChoices];
  let seed = seededNumber(`${id}:${answer}`);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const swapIndex = seed % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
};

const q = (id: string, prompt: string, answer: string, choices: string[], explanation: string, hint?: string): LabStep => ({
  id,
  prompt,
  answer,
  choices: shuffleChoices(id, answer, choices),
  visual: inferVisual(id, prompt, answer),
  explanation,
  hint
});

type SourceLearningModule = Omit<LearningModule, 'id'> & { id: SourceModuleId };

const sourceModules: SourceLearningModule[] = [
  {
    id: 'subnetting',
    title: 'Subnetting Basics',
    subtitle: 'Practice CIDR, masks, ranges, usable hosts, and subnet math.',
    difficulty: 'Beginner+',
    tags: ['CIDR', 'subnet masks', 'host ranges', 'subnet math'],
    lesson: [
      'CIDR tells you how many bits are locked for the network. A /24 leaves 8 host bits, so it has 256 total addresses.',
      'The first address in a subnet is the network address. The last address is the broadcast address.',
      'Subnet math usually comes down to host bits, powers of two, and the block size in the interesting octet.'
    ],
    learningSections: [
      {
        title: 'How the slash works',
        points: [
          'The slash number is the CIDR prefix. It tells you how many of the 32 IPv4 bits are network bits.',
          '/24 means 24 network bits and 8 host bits. /27 means 27 network bits and 5 host bits.',
          'More network bits means smaller subnets. Fewer host bits means fewer usable device addresses.'
        ]
      },
      {
        title: 'Subnet math steps',
        points: [
          'Host bits = 32 minus the slash number. Example: /27 has 5 host bits.',
          'Total addresses = 2 raised to the host-bit count. Example: 2^5 = 32 total addresses.',
          'Usable hosts usually = total addresses minus 2, because the network and broadcast addresses are reserved.'
        ]
      },
      {
        title: 'Mask, block size, and ranges',
        points: [
          'The subnet mask is the dotted-decimal version of the slash. /25 is 255.255.255.128, /26 is 255.255.255.192, and /27 is 255.255.255.224.',
          'Block size is 256 minus the interesting octet. For /27, 256 - 224 = 32.',
          'If the block size is 32, subnet starts are .0, .32, .64, .96, .128, .160, .192, and .224.'
        ]
      }
    ],
    labTitle: 'Subnet math workout',
    steps: [
      q('subnet-01', 'What subnet mask matches a /24 network?', '255.255.255.0', ['255.255.0.0', '255.255.255.0', '255.255.255.128', '255.255.255.192'], '/24 means the first 24 bits are network bits, which is 255.255.255.0.'),
      q('subnet-02', 'How many host bits are left in a /27 network?', '5', ['3', '4', '5', '27'], 'IPv4 has 32 bits. 32 - 27 = 5 host bits.', 'Subtract the slash number from 32.'),
      q('subnet-03', 'How many total addresses are in a /27 subnet?', '32', ['16', '30', '32', '64'], '/27 leaves 5 host bits. 2^5 = 32 total addresses.'),
      q('subnet-04', 'How many usable host addresses are in a /27 subnet?', '30', ['28', '30', '32', '62'], 'A /27 has 32 total addresses. Subtract network and broadcast: 32 - 2 = 30 usable hosts.'),
      q('subnet-05', 'What subnet mask matches a /26 network?', '255.255.255.192', ['255.255.255.128', '255.255.255.192', '255.255.255.224', '255.255.255.240'], '/26 uses two extra network bits in the last octet: 128 + 64 = 192.'),
      q('subnet-06', 'What is the block size for a /26 subnet?', '64', ['16', '32', '64', '128'], '/26 is 255.255.255.192. Block size = 256 - 192 = 64.'),
      q('subnet-07', 'What is the network address for 192.168.10.34/27?', '192.168.10.32', ['192.168.10.0', '192.168.10.32', '192.168.10.34', '192.168.10.64'], '/27 blocks move by 32. Address .34 sits in the .32 through .63 block.'),
      q('subnet-08', 'What is the broadcast address for 192.168.10.34/27?', '192.168.10.63', ['192.168.10.31', '192.168.10.32', '192.168.10.63', '192.168.10.64'], 'The .32 block ends at .63, one before the next block starts at .64.'),
      q('subnet-09', 'What is the first usable host in 192.168.10.34/27?', '192.168.10.33', ['192.168.10.32', '192.168.10.33', '192.168.10.34', '192.168.10.63'], 'The network is .32, so the first usable address is .33.'),
      q('subnet-10', 'What is the last usable host in 192.168.10.34/27?', '192.168.10.62', ['192.168.10.61', '192.168.10.62', '192.168.10.63', '192.168.10.64'], 'The broadcast address is .63, so the last usable address is .62.'),
      q('subnet-11', 'How many usable host addresses are in a /24 subnet?', '254', ['126', '128', '254', '256'], '/24 leaves 8 host bits. 2^8 = 256 total, minus 2 = 254 usable.'),
      q('subnet-12', 'How many usable host addresses are in a /25 subnet?', '126', ['62', '64', '126', '254'], '/25 leaves 7 host bits. 2^7 = 128 total, minus 2 = 126 usable.'),
      q('subnet-13', 'What subnet mask matches a /28 network?', '255.255.255.240', ['255.255.255.224', '255.255.255.240', '255.255.255.248', '255.255.255.252'], '/28 uses four host bits, so the last octet mask is 240.'),
      q('subnet-14', 'What is the block size for a /28 subnet?', '16', ['8', '14', '16', '32'], '/28 is 255.255.255.240. Block size = 256 - 240 = 16.'),
      q('subnet-15', 'What is the network address for 172.16.5.130/26?', '172.16.5.128', ['172.16.5.64', '172.16.5.128', '172.16.5.130', '172.16.5.192'], '/26 blocks are .0, .64, .128, .192. Address .130 is in the .128 block.'),
      q('subnet-16', 'What is the broadcast address for 172.16.5.130/26?', '172.16.5.191', ['172.16.5.127', '172.16.5.190', '172.16.5.191', '172.16.5.192'], 'The .128 block ends at .191.'),
      q('subnet-17', 'What is the network address for 10.1.2.99/25?', '10.1.2.0', ['10.1.2.0', '10.1.2.64', '10.1.2.99', '10.1.2.128'], '/25 blocks are .0 through .127 and .128 through .255. Address .99 is in the .0 block.'),
      q('subnet-18', 'What is the broadcast address for 10.1.2.99/25?', '10.1.2.127', ['10.1.2.99', '10.1.2.126', '10.1.2.127', '10.1.2.128'], 'The first /25 block runs from .0 through .127.'),
      q('subnet-19', 'A subnet needs at least 50 usable hosts. Which prefix is the smallest listed that fits?', '/26', ['/28', '/27', '/26', '/30'], '/26 gives 62 usable hosts. /27 gives only 30 usable hosts.'),
      q('subnet-20', 'A subnet needs at least 200 usable hosts. Which prefix is the smallest listed that fits?', '/24', ['/25', '/26', '/27', '/24'], '/24 gives 254 usable hosts. /25 gives only 126.')
    ]
  },
  {
    id: 'vlans',
    title: 'VLAN Basics',
    subtitle: 'Learn how access ports place devices into separate networks.',
    difficulty: 'Beginner',
    tags: ['VLANs', 'access ports', 'segmentation'],
    lesson: [
      'A VLAN is a logical network segment. Devices in different VLANs are separated unless routing is configured between them.',
      'An access port belongs to one VLAN and is normally used for an end device such as a PC, printer, or camera.',
      'VLANs reduce broadcast scope and help separate departments, device types, or security zones.'
    ],
    learningSections: [
      {
        title: 'What a VLAN does',
        points: [
          'A VLAN splits one physical switch into separate logical networks.',
          'Devices in VLAN 10 and VLAN 20 act like they are on different switches unless a router or Layer 3 switch routes between them.',
          'This helps reduce broadcast traffic and keeps groups such as users, printers, phones, and cameras separated.'
        ]
      },
      {
        title: 'Access ports',
        points: [
          'An access port carries traffic for one VLAN.',
          'End devices usually plug into access ports because a laptop, printer, or camera normally belongs to one VLAN.',
          'If a PC should be in VLAN 20, the switch port connected to that PC should be assigned as an access port in VLAN 20.'
        ]
      },
      {
        title: 'Common troubleshooting idea',
        points: [
          'If two devices should communicate but cannot, check whether they are in the same VLAN or whether routing exists between their VLANs.',
          'Also check that the switch port is assigned to the expected VLAN.',
          'A device in the wrong VLAN may still have link lights, but it can be logically separated from the network it needs.'
        ]
      }
    ],
    labTitle: 'VLAN scenario practice',
    steps: [
      q('vlan-01', 'A Sales workstation should be placed in VLAN 20. What VLAN should the access port use?', 'VLAN 20', ['VLAN 1', 'VLAN 10', 'VLAN 20', 'VLAN 99'], 'An access port for the Sales workstation should be assigned to the Sales VLAN, VLAN 20.'),
      q('vlan-02', 'A shared printer belongs only to VLAN 40. Should its port be access or trunk?', 'Access', ['Access', 'Trunk', 'Loopback', 'Routed only'], 'A printer is an end device, so it normally uses an access port.'),
      q('vlan-03', 'What do VLANs mainly reduce?', 'Broadcast scope', ['Cable length', 'Broadcast scope', 'MAC address size', 'Fiber speed'], 'VLANs split one large broadcast domain into smaller broadcast domains.'),
      q('vlan-04', 'Two PCs are on the same switch but different VLANs. Can they communicate directly without routing?', 'No', ['Yes', 'No', 'Only over Wi-Fi', 'Only with DNS'], 'Different VLANs need routing to communicate.'),
      q('vlan-05', 'IP phones should be separated from regular PCs. What technology helps with this?', 'VLANs', ['DNS', 'VLANs', 'NTP', 'NAT only'], 'VLANs segment traffic types such as voice and data.'),
      q('vlan-06', 'Each VLAN creates its own broadcast what?', 'Domain', ['Cable', 'Port', 'Domain', 'Gateway'], 'A VLAN is a separate broadcast domain.'),
      q('vlan-07', 'A security camera belongs only to VLAN 60. What port type is normally used?', 'Access', ['Access', 'Trunk', 'SPAN', 'Console'], 'Single-VLAN end devices normally use access ports.'),
      q('vlan-08', 'A PC has link lights but is assigned to the wrong VLAN. What should you fix?', 'Access VLAN assignment', ['DNS record', 'Access VLAN assignment', 'Cable category', 'NTP source'], 'The physical link can be up while the logical VLAN assignment is wrong.'),
      q('vlan-09', 'What device function routes traffic between VLANs?', 'Layer 3 routing', ['Layer 3 routing', 'Layer 1 repeating', 'Port mirroring', 'MAC flooding'], 'Inter-VLAN communication requires routing.'),
      q('vlan-10', 'What is the default VLAN often seen on many switches?', 'VLAN 1', ['VLAN 1', 'VLAN 10', 'VLAN 99', 'VLAN 4096'], 'Many switches use VLAN 1 as the default VLAN.'),
      q('vlan-11', 'Which port mode is best for a normal user laptop?', 'Access', ['Access', 'Trunk', 'Monitor', 'Native'], 'A laptop usually belongs to one VLAN, so access is the best fit.'),
      q('vlan-12', 'Which problem can happen if a port is in the wrong VLAN?', 'The device lands in the wrong network', ['The device lands in the wrong network', 'The device joins the voice VLAN instead of the data VLAN', 'The device cannot reach the expected gateway', 'The device is isolated from required local resources'], 'Wrong VLAN assignment places the device in the wrong logical network.'),
      q('vlan-13', 'What should VLAN 10 and VLAN 20 have if they need different IP networks?', 'Different subnets', ['The same subnet', 'Different subnets', 'No gateway', 'The same MAC address'], 'Different VLANs normally use different IP subnets.'),
      q('vlan-14', 'Which VLAN use case is most security-focused?', 'Separating guest Wi-Fi from internal devices', ['Combining all printers with servers', 'Separating guest Wi-Fi from internal devices', 'Disabling all gateways', 'Using longer cables'], 'Guest traffic should be segmented away from trusted internal devices.'),
      q('vlan-15', 'Which switch feature lets one physical switch act like separate logical switches?', 'VLANs', ['VLANs', 'NTP', 'DHCP lease time', 'ARP cache'], 'VLANs create logical segmentation on switches.'),
      q('vlan-16', 'What is usually assigned to an access port?', 'One VLAN', ['One VLAN', 'Every VLAN', 'Only native VLAN traffic', 'No VLAN'], 'An access port carries one VLAN for an end device.'),
      q('vlan-17', 'A device in VLAN 30 needs to reach VLAN 40. What is needed?', 'Routing between VLANs', ['A crossover cable', 'Routing between VLANs', 'A longer subnet mask only', 'A DNS suffix'], 'Traffic between VLANs requires Layer 3 routing.'),
      q('vlan-18', 'Which traffic type is commonly placed in a voice VLAN?', 'IP phone traffic', ['IP phone traffic', 'Guest wireless traffic', 'Printer management traffic', 'Server backup traffic'], 'Voice VLANs commonly carry IP phone traffic.'),
      q('vlan-19', 'Which statement is true?', 'VLANs separate broadcast domains', ['VLANs separate broadcast domains', 'VLANs remove the need for IP addresses', 'VLANs only work on routers', 'VLANs are only for wireless'], 'The core VLAN concept is broadcast-domain separation.'),
      q('vlan-20', 'What should you check first when a user is plugged into the right switch but the wrong department network?', 'The port VLAN assignment', ['The port VLAN assignment', 'The switchport mode', 'The DHCP scope for that VLAN', 'The wall jack patch-panel mapping'], 'Wrong department network often points to a wrong access VLAN.')
    ]
  },
  {
    id: 'trunking',
    title: 'Trunking Basics',
    subtitle: 'Practice allowed VLANs, native VLANs, and common trunk mistakes.',
    difficulty: 'Beginner+',
    tags: ['trunks', '802.1Q', 'native VLAN'],
    lesson: [
      'A trunk port carries traffic for multiple VLANs between switches or between a switch and another network device.',
      '802.1Q tagging marks frames so the receiving device knows which VLAN they belong to.',
      'A native VLAN carries untagged traffic on an 802.1Q trunk. A native VLAN mismatch can create confusing connectivity and security issues.'
    ],
    learningSections: [
      {
        title: 'What a trunk is',
        points: [
          'A trunk is a link that carries more than one VLAN over the same cable.',
          'Trunks are common between switches, or between a switch and a router, firewall, hypervisor, or wireless controller.',
          'Without a trunk, you would need separate physical links for each VLAN.'
        ]
      },
      {
        title: '802.1Q tags and allowed VLANs',
        points: [
          '802.1Q adds a VLAN tag to Ethernet frames so the device on the other end knows which VLAN each frame belongs to.',
          'The allowed VLAN list controls which VLANs are permitted across a trunk.',
          'If VLAN 30 is missing from the allowed list, VLAN 30 traffic will not cross that trunk even if the VLAN exists on both switches.'
        ]
      },
      {
        title: 'Native VLAN',
        points: [
          'The native VLAN is the VLAN used for untagged traffic on an 802.1Q trunk.',
          'Both sides of a trunk should use the same native VLAN.',
          'A native VLAN mismatch can cause traffic to land in the wrong VLAN and can be a security concern.'
        ]
      }
    ],
    labTitle: 'Trunk troubleshooting practice',
    steps: [
      q('trunk-01', 'Two switches need to carry VLANs 10, 20, and 30 over one link. What should the link be?', 'Trunk', ['Access', 'Trunk', 'Console', 'Loopback'], 'A trunk carries multiple VLANs over one link.'),
      q('trunk-02', 'A trunk allows VLANs 10 and 20, but VLAN 30 cannot cross. What must be added?', 'VLAN 30', ['VLAN 1', 'VLAN 10', 'VLAN 20', 'VLAN 30'], 'VLAN 30 must be allowed on the trunk.'),
      q('trunk-03', 'Switch A native VLAN is 99 and Switch B native VLAN is 1. What should you fix?', 'Native VLAN mismatch', ['Native VLAN mismatch', 'DNS mismatch', 'Subnet host count', 'Cable category'], 'Both trunk ends should agree on the native VLAN.'),
      q('trunk-04', 'What tagging standard is commonly used on Ethernet trunks?', '802.1Q', ['802.1Q', '802.11ax', '802.3af', '802.1X'], '802.1Q is the common VLAN tagging standard.'),
      q('trunk-05', 'A link between two switches carries user, voice, and camera VLANs. What type of port is it?', 'Trunk', ['Access', 'Trunk', 'Console', 'Management only'], 'Switch-to-switch links carrying multiple VLANs are trunks.'),
      q('trunk-06', 'A normal desktop PC belongs only to VLAN 10. What port type is usually best?', 'Access', ['Access', 'Trunk', 'Native only', 'SPAN'], 'Normal end devices usually use access ports.'),
      q('trunk-07', 'On an 802.1Q trunk, untagged traffic belongs to which VLAN type?', 'Native VLAN', ['Allowed VLAN', 'Native VLAN', 'Voice VLAN only', 'Management VLAN only'], 'The native VLAN carries untagged traffic on an 802.1Q trunk.'),
      q('trunk-08', 'VLAN 20 exists on both switches but is not allowed on the trunk. Will VLAN 20 traffic cross?', 'No', ['Yes', 'No', 'Only DNS', 'Only DHCP'], 'A VLAN must be allowed on the trunk to cross it.'),
      q('trunk-09', 'What does an 802.1Q tag identify?', 'The VLAN for the frame', ['The VLAN for the frame', 'The native VLAN behavior', 'The allowed VLAN list', 'The trunk encapsulation type'], 'The tag tells the receiving device which VLAN the frame belongs to.'),
      q('trunk-10', 'Which link most likely needs trunking?', 'Switch to switch carrying multiple VLANs', ['PC to access port in VLAN 10', 'Switch to switch carrying multiple VLANs', 'Printer to access port in VLAN 40', 'Camera to access port in VLAN 60'], 'Trunks are commonly used between switches.'),
      q('trunk-11', 'What list controls which VLANs may pass over a trunk?', 'Allowed VLAN list', ['DNS search list', 'Allowed VLAN list', 'MAC aging table', 'DHCP scope list'], 'The allowed VLAN list permits or blocks VLANs on the trunk.'),
      q('trunk-12', 'If all VLANs except VLAN 50 work across a trunk, what is a likely cause?', 'VLAN 50 is missing from the allowed list', ['VLAN 50 is missing from the allowed list', 'VLAN 50 does not exist on one switch', 'The native VLAN is mismatched', 'The port is configured as access instead of trunk'], 'One missing VLAN usually points to the allowed VLAN list or VLAN existence.'),
      q('trunk-13', 'What is a common result of a native VLAN mismatch?', 'Untagged traffic may land in the wrong VLAN', ['Untagged traffic may land in the wrong VLAN', 'DNS records become encrypted', 'Ports change to UDP', 'All switches become routers'], 'Mismatched native VLANs can place untagged frames into different VLANs.'),
      q('trunk-14', 'Which trunk setting should match on both ends for untagged traffic?', 'Native VLAN', ['Native VLAN', 'Screen resolution', 'NTP stratum', 'Browser cache'], 'Native VLAN should match on both sides of a trunk.'),
      q('trunk-15', 'A hypervisor host carries many VM VLANs through one NIC. What switch port mode is likely needed?', 'Trunk', ['Access', 'Trunk', 'Console', 'Shutdown'], 'A host carrying multiple VM VLANs commonly needs a trunk.'),
      q('trunk-16', 'Which frame type is normally marked with a VLAN ID on a trunk?', 'Tagged frame', ['Tagged frame', 'Power frame', 'DNS packet only', 'ARP cache entry'], 'Tagged frames carry VLAN identification.'),
      q('trunk-17', 'What should happen to VLAN 10 traffic if VLAN 10 is removed from the trunk allowed list?', 'It should stop crossing the trunk', ['It should stop crossing the trunk', 'It should become HTTPS', 'It should become VLAN 1 automatically', 'It should ignore the list'], 'Traffic for a VLAN not allowed on a trunk will not pass.'),
      q('trunk-18', 'Which port type carries one VLAN by default for an end device?', 'Access', ['Access', 'Trunk', 'Native', 'Tagged-only uplink'], 'Access ports carry one VLAN for end devices.'),
      q('trunk-19', 'What does trunking help avoid when carrying many VLANs between switches?', 'Separate physical cable for every VLAN', ['Separate physical cable for every VLAN', 'Using IP addresses', 'Routing tables', 'DNS lookups'], 'A trunk lets multiple VLANs share one physical link.'),
      q('trunk-20', 'Which answer best describes the native VLAN?', 'The VLAN for untagged trunk traffic', ['The VLAN for untagged trunk traffic', 'The fastest VLAN', 'The only routed VLAN', 'The VLAN used for HTTPS only'], 'The native VLAN handles untagged traffic on an 802.1Q trunk.')
    ]
  },
  {
    id: 'ports',
    title: 'Ports and Protocols',
    subtitle: 'Memorize common service ports with scenario drills.',
    difficulty: 'Beginner',
    tags: ['ports', 'protocols', 'services'],
    lesson: [
      'Ports help devices send traffic to the right application or service.',
      'Network+ expects you to recognize common ports such as DNS 53, DHCP 67/68, HTTP 80, HTTPS 443, SSH 22, RDP 3389, and SNMP 161/162.',
      'Memorizing ports is easier when you attach them to real tasks, such as name lookup, secure web browsing, or remote administration.'
    ],
    learningSections: [
      {
        title: 'What ports do',
        points: [
          'An IP address gets traffic to the right device. A port number gets traffic to the right service on that device.',
          'TCP is connection-oriented and is common for web, email, file transfer, and remote access services.',
          'UDP is connectionless and is common for lightweight lookups, streaming-style traffic, DHCP, and many DNS requests.'
        ]
      },
      {
        title: 'High-value ports to memorize',
        points: [
          'DNS uses 53. DHCP uses 67 and 68. HTTP uses 80. HTTPS uses 443.',
          'SSH uses 22. Telnet uses 23. RDP uses 3389. SNMP uses 161 and 162.',
          'SMTP uses 25, POP3 uses 110, IMAP uses 143, and secure mail variants often use 465, 587, 993, or 995 depending on the service.'
        ]
      },
      {
        title: 'How to reason through scenarios',
        points: [
          'Name lookup points to DNS 53.',
          'Getting an IP address automatically points to DHCP 67/68.',
          'Secure web browsing points to HTTPS 443, while insecure web browsing points to HTTP 80.'
        ]
      }
    ],
    labTitle: 'Ports and protocols quiz',
    steps: [
      q('port-01', 'A client needs to resolve example.com to an IP address. Which port does DNS usually use?', '53', ['22', '53', '80', '443'], 'DNS commonly uses UDP 53 for lookups.'),
      q('port-02', 'A user connects to a secure website. Which TCP port is HTTPS?', '443', ['80', '110', '143', '443'], 'HTTPS uses TCP 443.'),
      q('port-03', 'A network admin opens a secure terminal session to a Linux server. Which port is SSH?', '22', ['21', '22', '23', '25'], 'SSH uses TCP 22.'),
      q('port-04', 'A technician connects to a Windows desktop remotely using RDP. Which port is commonly used?', '3389', ['389', '443', '3389', '5900'], 'RDP commonly uses port 3389.'),
      q('port-05', 'A user browses to an unencrypted website. Which TCP port is HTTP?', '80', ['53', '80', '123', '443'], 'HTTP uses TCP 80.'),
      q('port-06', 'A DHCP server listens for client requests on which UDP port?', '67', ['53', '67', '68', '69'], 'DHCP servers listen on UDP 67.'),
      q('port-07', 'A DHCP client receives replies on which UDP port?', '68', ['53', '67', '68', '123'], 'DHCP clients use UDP 68.'),
      q('port-08', 'A monitoring system polls a network device with SNMP. Which port is commonly used?', '161', ['110', '123', '161', '162'], 'SNMP polling commonly uses UDP 161.'),
      q('port-09', 'A network device sends an SNMP trap. Which port is commonly used?', '162', ['123', '143', '161', '162'], 'SNMP traps commonly use UDP 162.'),
      q('port-10', 'A server syncs time with NTP. Which port does NTP use?', '123', ['53', '69', '123', '389'], 'NTP uses UDP 123.'),
      q('port-11', 'A mail client retrieves email using IMAP without encryption. Which port is IMAP?', '143', ['110', '143', '389', '993'], 'IMAP uses TCP 143.'),
      q('port-12', 'A mail client retrieves email using POP3 without encryption. Which port is POP3?', '110', ['25', '110', '143', '587'], 'POP3 uses TCP 110.'),
      q('port-13', 'A mail server sends mail using SMTP. Which port is SMTP?', '25', ['25', '53', '110', '143'], 'SMTP uses TCP 25 for mail transfer.'),
      q('port-14', 'A client transfers files using FTP control traffic. Which port is FTP control?', '21', ['20', '21', '22', '23'], 'FTP control uses TCP 21.'),
      q('port-15', 'FTP data transfer commonly uses which port?', '20', ['20', '21', '22', '25'], 'FTP data commonly uses TCP 20.'),
      q('port-16', 'A user connects with insecure Telnet. Which port is Telnet?', '23', ['22', '23', '53', '80'], 'Telnet uses TCP 23 and is not encrypted.'),
      q('port-17', 'A client downloads a file using TFTP. Which port is TFTP?', '69', ['53', '67', '69', '123'], 'TFTP uses UDP 69.'),
      q('port-18', 'A directory lookup uses LDAP without encryption. Which port is LDAP?', '389', ['161', '389', '443', '636'], 'LDAP uses TCP/UDP 389. Secure LDAP commonly uses 636.'),
      q('port-19', 'Secure IMAP commonly uses which port?', '993', ['143', '465', '587', '993'], 'IMAPS commonly uses TCP 993.'),
      q('port-20', 'Secure POP3 commonly uses which port?', '995', ['110', '143', '993', '995'], 'POP3S commonly uses TCP 995.')
    ]
  }
];

const byId = (id: SourceModuleId) => sourceModules.find((module) => module.id === id)!;

byId('subnetting').steps.push(
  q('subnet-21', 'What subnet mask matches a /23 network?', '255.255.254.0', ['255.255.0.0', '255.255.254.0', '255.255.255.0', '255.255.255.128'], '/23 uses 23 network bits, so the third octet mask is 254.'),
  q('subnet-22', 'How many usable hosts are in a /23 subnet?', '510', ['254', '510', '512', '1022'], '/23 leaves 9 host bits. 2^9 = 512 total, minus 2 = 510 usable.'),
  q('subnet-23', 'What subnet mask matches a /30 network?', '255.255.255.252', ['255.255.255.248', '255.255.255.252', '255.255.255.254', '255.255.255.255'], '/30 has a last octet mask of 252.'),
  q('subnet-24', 'How many usable hosts are in a traditional /30 subnet?', '2', ['0', '2', '4', '6'], '/30 has 4 total addresses. 4 - 2 = 2 usable hosts.'),
  q('subnet-25', 'What is the block size for a /29 subnet?', '8', ['4', '6', '8', '16'], '/29 is 255.255.255.248. Block size = 256 - 248 = 8.'),
  q('subnet-26', 'What is the network address for 192.168.2.77/28?', '192.168.2.64', ['192.168.2.48', '192.168.2.64', '192.168.2.76', '192.168.2.80'], '/28 blocks move by 16. Address .77 is in the .64 through .79 block.'),
  q('subnet-27', 'What is the broadcast address for 192.168.2.77/28?', '192.168.2.79', ['192.168.2.63', '192.168.2.78', '192.168.2.79', '192.168.2.80'], 'The .64 /28 block ends at .79.'),
  q('subnet-28', 'A subnet needs at least 12 usable hosts. Which prefix is the smallest listed that fits?', '/28', ['/30', '/29', '/28', '/27'], '/28 gives 14 usable hosts. /29 gives only 6.'),
  q('subnet-29', 'A subnet needs at least 100 usable hosts. Which prefix is the smallest listed that fits?', '/25', ['/27', '/26', '/25', '/24'], '/25 gives 126 usable hosts. /26 gives only 62.'),
  q('subnet-30', 'What is the interesting octet for 172.16.40.12/20?', 'Third octet', ['First octet', 'Second octet', 'Third octet', 'Fourth octet'], '/20 is 255.255.240.0, so subnetting advances in the third octet.')
);

byId('vlans').steps.push(
  q('vlan-21', 'Which VLAN type is commonly used for IP phones?', 'Voice VLAN', ['Native VLAN', 'Voice VLAN', 'Guest VLAN only', 'Blackhole VLAN'], 'Voice VLANs commonly carry IP phone traffic.'),
  q('vlan-22', 'Which VLAN should guest Wi-Fi generally avoid using?', 'Internal trusted VLAN', ['Guest VLAN', 'Internal trusted VLAN', 'Quarantine VLAN', 'Internet-only VLAN'], 'Guest traffic should be separated from trusted internal resources.'),
  q('vlan-23', 'What does inter-VLAN routing allow?', 'Communication between VLANs', ['Communication between VLANs', 'Cable testing', 'DNS caching only', 'MAC address encryption'], 'Routing enables traffic to move between separate VLANs.'),
  q('vlan-24', 'Which problem is most likely if a phone works but the attached PC lands in the wrong subnet?', 'Incorrect data VLAN assignment', ['Incorrect data VLAN assignment', 'Wrong NTP port', 'Too many DNS records', 'Bad broadcast address only'], 'Phone and PC traffic can use different VLAN assignments.'),
  q('vlan-25', 'Which command output would help confirm VLAN membership on a switch?', 'show vlan', ['show vlan', 'show clock', 'show power', 'show dns'], 'show vlan is used to view VLANs and port membership.'),
  q('vlan-26', 'What is the safest default for unused access ports?', 'Disable them or place them in an unused VLAN', ['Make them trunks', 'Disable them or place them in an unused VLAN', 'Assign them to every VLAN', 'Use VLAN 1 for all'], 'Unused ports should be shut down or isolated.'),
  q('vlan-27', 'What happens to broadcasts inside VLAN 10?', 'They stay within VLAN 10', ['They stay within VLAN 10', 'They always flood every VLAN', 'They become HTTPS traffic', 'They skip switches'], 'Broadcasts are contained within their VLAN.'),
  q('vlan-28', 'Which pairing is most typical?', 'VLAN 20 with its own subnet', ['VLAN 20 with its own subnet', 'Every VLAN sharing one subnet', 'No gateway on any VLAN', 'DNS as the VLAN ID'], 'Each VLAN normally maps to its own IP subnet.'),
  q('vlan-29', 'What should match the user department design: the wall jack switch port or the printer driver?', 'The wall jack switch port', ['The wall jack switch port', 'The access VLAN assigned to that jack', 'The patch-panel connection for that workspace', 'The switchport description and VLAN map'], 'The switch port VLAN decides which logical network the connected device joins.'),
  q('vlan-30', 'Which VLAN concept is tested when a device can reach local VLAN peers but not another VLAN?', 'Inter-VLAN routing', ['Inter-VLAN routing', 'Fiber polarity', 'Port speed only', 'DNS MX records'], 'Reaching another VLAN requires routing.')
);

byId('trunking').steps.push(
  q('trunk-21', 'Which trunk issue can make one VLAN fail while others still work?', 'Missing allowed VLAN', ['Missing allowed VLAN', 'VLAN not created on one switch', 'Native VLAN mismatch', 'Access mode on the uplink'], 'If only one VLAN fails over a trunk, check whether that VLAN is allowed.'),
  q('trunk-22', 'Which port would commonly connect a switch to a router-on-a-stick interface?', 'Trunk port', ['Access port', 'Trunk port', 'Console port', 'Disabled port'], 'Router-on-a-stick uses a trunk to carry multiple VLANs to router subinterfaces.'),
  q('trunk-23', 'What should router subinterfaces correspond to in router-on-a-stick?', 'VLANs', ['VLANs', 'DNS zones', 'Cable colors', 'NTP servers'], 'Each subinterface is commonly associated with a VLAN.'),
  q('trunk-24', 'What is the best description of an allowed VLAN list?', 'A filter for VLANs permitted on a trunk', ['A filter for VLANs permitted on a trunk', 'A list of DNS servers', 'A password policy', 'A cable map only'], 'Allowed VLAN lists control which VLANs can traverse a trunk.'),
  q('trunk-25', 'A trunk link has native VLAN 10 on one side and 20 on the other. What is wrong?', 'Native VLAN mismatch', ['Native VLAN mismatch', 'Wrong DHCP lease', 'Bad HTTP port', 'Loopback failure'], 'Native VLANs should match on both ends.'),
  q('trunk-26', 'Which traffic on an 802.1Q trunk usually does not carry a VLAN tag?', 'Native VLAN traffic', ['Native VLAN traffic', 'All VLAN traffic', 'Only HTTPS traffic', 'Only DNS traffic'], 'Native VLAN traffic is typically untagged.'),
  q('trunk-27', 'Which switch link is least likely to be a trunk?', 'Switch to single desktop PC', ['Switch to switch uplink', 'Switch to router-on-a-stick', 'Switch to single desktop PC', 'Switch to hypervisor host'], 'A single desktop PC normally uses an access port.'),
  q('trunk-28', 'What does pruning or limiting allowed VLANs on trunks help reduce?', 'Unneeded VLAN traffic on that link', ['Unneeded VLAN traffic on that link', 'IP address length', 'The need for DNS', 'Subnet host bits'], 'Limiting allowed VLANs keeps unnecessary VLAN traffic off a trunk.'),
  q('trunk-29', 'Which trunk detail matters for security because it handles untagged traffic?', 'Native VLAN', ['Native VLAN', 'NTP server', 'Browser port', 'SMTP relay'], 'Native VLAN treatment matters because untagged traffic maps there.'),
  q('trunk-30', 'A trunk carries VLANs 10, 20, 30, and 40. How many access VLANs can one trunk carry?', 'Multiple VLANs', ['One VLAN only', 'Multiple VLANs', 'No VLANs', 'Only VLAN 1'], 'Trunks are designed to carry multiple VLANs.')
);

byId('ports').steps.push(
  q('port-21', 'Which port is commonly used by SMB for Windows file sharing?', '445', ['137', '139', '445', '3389'], 'SMB commonly uses TCP 445.'),
  q('port-22', 'Which port is commonly used by Kerberos?', '88', ['53', '88', '110', '389'], 'Kerberos commonly uses port 88.'),
  q('port-23', 'Which port is commonly used by LDAPS?', '636', ['389', '443', '636', '993'], 'LDAPS commonly uses TCP 636.'),
  q('port-24', 'Which secure SMTP submission port is commonly used by mail clients?', '587', ['25', '110', '143', '587'], 'SMTP submission commonly uses TCP 587.'),
  q('port-25', 'Which port is commonly associated with SMTPS?', '465', ['25', '143', '465', '995'], 'SMTPS is commonly associated with TCP 465.'),
  q('port-26', 'Which protocol uses port 179?', 'BGP', ['BGP', 'OSPF', 'DNS', 'NTP'], 'BGP uses TCP 179.'),
  q('port-27', 'Which protocol uses IP protocol number 89 instead of TCP or UDP port numbers?', 'OSPF', ['OSPF', 'HTTP', 'IMAP', 'SNMP'], 'OSPF uses IP protocol number 89.'),
  q('port-28', 'Which port is commonly used by RADIUS authentication?', '1812', ['161', '389', '1812', '3389'], 'RADIUS authentication commonly uses UDP 1812.'),
  q('port-29', 'Which port is commonly used by RADIUS accounting?', '1813', ['162', '636', '1812', '1813'], 'RADIUS accounting commonly uses UDP 1813.'),
  q('port-30', 'Which port is commonly used by Syslog?', '514', ['123', '389', '514', '636'], 'Syslog commonly uses UDP 514.')
);

const subnettingSource = byId('subnetting');
const vlanSource = byId('vlans');
const trunkingSource = byId('trunking');
const portsSource = byId('ports');

const servicesModule: LearningModule = {
  id: 'services',
  title: 'Network Services',
  subtitle: 'Practice the services that make networks usable, such as DHCP, DNS, time, logging, and authentication.',
  difficulty: 'Beginner+',
  tags: ['DNS', 'DHCP', 'NTP', 'SNMP', 'RADIUS', 'Syslog', 'network services'],
  lesson: [
    'Network services are background helpers that make the network easier to use and operate.',
    'DNS turns names into IP addresses. DHCP gives clients IP settings automatically. NTP keeps device clocks in sync.',
    'Monitoring, logging, directory, and authentication services help admins see what is happening and control who can connect.'
  ],
  learningSections: [
    {
      title: 'Core client services',
      points: [
        'DNS answers name lookups, such as turning example.com into an IP address.',
        'DHCP leases IP settings such as address, subnet mask, default gateway, and DNS server.',
        'NTP keeps time consistent so logs, certificates, and authentication are easier to trust.'
      ]
    },
    {
      title: 'Admin services',
      points: [
        'SNMP polls devices and receives traps for monitoring.',
        'Syslog centralizes log messages from routers, switches, firewalls, and servers.',
        'RADIUS commonly supports centralized network access authentication.'
      ]
    },
    {
      title: 'How to spot the clue',
      points: [
        'Name problems usually point to DNS.',
        'Automatic addressing problems usually point to DHCP.',
        'Wrong timestamps in logs often point to NTP or time settings.'
      ]
    }
  ],
  labTitle: 'Network services practice',
  steps: [
    q('port-service-01', 'A laptop joins the network and automatically receives an IP address, subnet mask, gateway, and DNS server. Which service did this?', 'DHCP', ['DNS', 'DHCP', 'SNMP', 'NTP'], 'DHCP leases IP configuration details to clients automatically.'),
    q('port-service-02', 'A user can ping 8.8.8.8 but cannot browse to example.com. Which service should you check first?', 'DNS', ['DNS', 'DHCP', 'RDP', 'SMTP'], 'If IP connectivity works but names fail, DNS is the first service to check.'),
    q('port-service-03', 'Device logs show the wrong time on every event. Which service helps fix this?', 'NTP', ['SNMP', 'NTP', 'HTTP', 'POP3'], 'NTP synchronizes device clocks.'),
    q('port-service-04', 'A monitoring server polls a switch for interface counters. Which service is most likely used?', 'SNMP', ['SNMP', 'SMTP', 'IMAP', 'HTTPS'], 'SNMP is commonly used to monitor network devices.'),
    q('port-service-05', 'A router sends log messages to one central logging server. Which protocol is commonly used?', 'Syslog', ['Syslog', 'Kerberos', 'BGP', 'LDAP'], 'Syslog is used to send event messages to a logging server.'),
    q('port-service-06', 'A VPN concentrator checks user credentials against a centralized access server. Which protocol is a likely fit?', 'RADIUS', ['RADIUS', 'NTP', 'TFTP', 'OSPF'], 'RADIUS is commonly used for centralized authentication, authorization, and accounting.'),
    q('port-service-07', 'A DHCP client listens for replies on which UDP port?', '68', ['53', '67', '68', '123'], 'DHCP clients use UDP 68 for replies.'),
    q('port-service-08', 'A DHCP server listens for requests on which UDP port?', '67', ['53', '67', '68', '161'], 'DHCP servers listen on UDP 67.'),
    q('port-service-09', 'DNS name lookups commonly use which port?', '53', ['22', '53', '80', '443'], 'DNS commonly uses port 53.'),
    q('port-service-10', 'NTP commonly uses which UDP port?', '123', ['69', '110', '123', '389'], 'NTP uses UDP 123.'),
    q('port-service-11', 'SNMP polling commonly uses which UDP port?', '161', ['123', '161', '162', '514'], 'SNMP polling commonly uses UDP 161.'),
    q('port-service-12', 'SNMP traps commonly use which UDP port?', '162', ['123', '161', '162', '514'], 'SNMP traps commonly use UDP 162.'),
    q('port-service-13', 'Syslog commonly uses which port?', '514', ['123', '389', '514', '1812'], 'Syslog commonly uses UDP 514.'),
    q('port-service-14', 'RADIUS authentication commonly uses which port?', '1812', ['161', '389', '1812', '3389'], 'RADIUS authentication commonly uses UDP 1812.'),
    q('port-service-15', 'RADIUS accounting commonly uses which port?', '1813', ['162', '636', '1812', '1813'], 'RADIUS accounting commonly uses UDP 1813.'),
    q('port-service-16', 'A directory lookup without encryption most commonly points to which protocol?', 'LDAP', ['LDAP', 'NTP', 'RDP', 'TFTP'], 'LDAP is commonly used for directory lookups.'),
    q('port-service-17', 'Secure LDAP commonly uses which port?', '636', ['389', '443', '636', '993'], 'LDAPS commonly uses TCP 636.'),
    q('port-service-18', 'A Windows domain login using tickets most likely involves which authentication protocol?', 'Kerberos', ['Kerberos', 'SNMP', 'SMTP', 'DHCP'], 'Kerberos is a ticket-based authentication protocol.'),
    q('port-service-19', 'A small device downloads a boot file using a simple UDP file transfer service. Which protocol is likely?', 'TFTP', ['TFTP', 'HTTPS', 'RDP', 'IMAP'], 'TFTP is a simple UDP file transfer protocol often used for boot or device files.'),
    q('port-service-20', 'Which service should be highly available because clients need it to find nearly every named resource?', 'DNS', ['DNS', 'Telnet', 'POP3', 'FTP'], 'DNS is a foundational service because users and apps depend on name resolution.')
  ]
};

const securityModule: LearningModule = {
  id: 'security',
  title: 'Security & Segmentation',
  subtitle: 'Practice basic security ideas, VLAN separation, trusted zones, hardening, and safe remote access.',
  difficulty: 'Beginner+',
  tags: ['segmentation', 'VLANs', 'access control', 'remote access', 'hardening'],
  lesson: [
    'Network security often starts by separating traffic, allowing only what is needed, and using encrypted management tools.',
    'Segmentation uses VLANs, subnets, firewall rules, and trusted or untrusted zones to limit where traffic can go.',
    'Hardening means reducing risk by disabling unused services, protecting management access, and avoiding insecure defaults.'
  ],
  learningSections: [
    {
      title: 'Segmentation',
      points: [
        'Guest devices should be separated from internal trusted devices.',
        'Voice, camera, user, and server networks are often placed into different VLANs or security zones.',
        'A firewall or Layer 3 device can control which traffic is allowed between segments.'
      ]
    },
    {
      title: 'Secure access',
      points: [
        'SSH is preferred over Telnet because SSH encrypts the remote session.',
        'Administrative interfaces should be limited to trusted management networks.',
        'Unused switch ports should be disabled or placed in an unused VLAN.'
      ]
    },
    {
      title: 'Common clues',
      points: [
        'Unencrypted remote terminal access points to Telnet risk.',
        'Unknown devices on open switch ports point to physical access risk.',
        'Too much access between networks points to weak segmentation.'
      ]
    }
  ],
  labTitle: 'Security and segmentation practice',
  steps: [
    q('security-01', 'Which design best protects internal devices from visitors on guest Wi-Fi?', 'Put guest Wi-Fi in a separate VLAN or zone', ['Put guest Wi-Fi in a separate VLAN or zone', 'Use the same VLAN for everyone', 'Disable DNS for internal users', 'Make every switch port a trunk'], 'Guest traffic should be segmented away from trusted internal devices.'),
    q('security-02', 'Which remote access protocol is preferred because it encrypts the session?', 'SSH', ['Telnet', 'SSH', 'HTTP', 'TFTP'], 'SSH encrypts remote command-line access.'),
    q('security-03', 'Which remote access protocol should usually be avoided because it is unencrypted?', 'Telnet', ['SSH', 'HTTPS', 'Telnet', 'RDP'], 'Telnet sends traffic without encryption.'),
    q('security-04', 'What is a good practice for unused switch ports?', 'Disable them or place them in an unused VLAN', ['Make them trunks', 'Disable them or place them in an unused VLAN', 'Assign them to every VLAN', 'Use them for guest and server traffic'], 'Unused ports should not provide easy access to production networks.'),
    q('security-05', 'Which concept divides a network so a problem in one area is less likely to spread everywhere?', 'Segmentation', ['Segmentation', 'Broadcasting', 'Autonegotiation', 'Crosstalk'], 'Segmentation limits traffic and trust boundaries.'),
    q('security-06', 'Which network should normally have the most restricted access?', 'Management network', ['Guest network', 'Management network', 'Public Wi-Fi', 'Printer-only network'], 'Management networks control infrastructure and should be tightly protected.'),
    q('security-07', 'Which rule is the best starting point for firewall access between zones?', 'Allow only required traffic', ['Allow only required traffic', 'Allow every port', 'Block DNS everywhere', 'Trust all VLANs equally'], 'Least privilege means allowing only what is needed.'),
    q('security-08', 'Which attack can overwhelm a switch CAM table and cause flooding behavior?', 'MAC flooding', ['MAC flooding', 'NTP drift', 'DNS recursion', 'Subnetting'], 'MAC flooding targets the switch MAC address table.'),
    q('security-09', 'Which method helps prove a device or user is allowed to connect?', 'Authentication', ['Authentication', 'Broadcasting', 'Fragmentation', 'Subnet masking'], 'Authentication verifies identity.'),
    q('security-10', 'Which term means deciding what an authenticated user is allowed to do?', 'Authorization', ['Authorization', 'Latency', 'Crosstalk', 'Encapsulation'], 'Authorization controls permitted actions after identity is verified.'),
    q('security-11', 'Which kind of data protection does HTTPS provide for web traffic?', 'Encryption in transit', ['Encryption in transit', 'More broadcast traffic', 'Lower VLAN IDs', 'A larger subnet mask'], 'HTTPS protects traffic while it crosses the network.'),
    q('security-12', 'What should admin web pages use instead of HTTP?', 'HTTPS', ['HTTPS', 'TFTP', 'POP3', 'Telnet'], 'HTTPS encrypts web management traffic.'),
    q('security-13', 'Which VLAN should usually not be used for all production devices just because it is the default?', 'VLAN 1', ['VLAN 1', 'VLAN 20', 'Voice VLAN', 'Guest VLAN'], 'Leaving everything in the default VLAN is poor segmentation.'),
    q('security-14', 'What is the security benefit of limiting allowed VLANs on a trunk?', 'Only needed VLANs can cross that link', ['Only needed VLANs can cross that link', 'DNS becomes encrypted', 'The cable becomes fiber', 'Ports stop using TCP'], 'Allowed VLAN lists reduce unnecessary VLAN exposure on trunks.'),
    q('security-15', 'Which zone should contain public-facing servers more often than user desktops?', 'DMZ', ['DMZ', 'Native VLAN', 'Loopback', 'Broadcast domain only'], 'A DMZ commonly holds public-facing services separated from the trusted LAN.'),
    q('security-16', 'Which control helps stop random people from plugging into empty wall jacks?', 'Disable unused switch ports', ['Disable unused switch ports', 'Increase DHCP lease time', 'Use POP3', 'Lower the MTU'], 'Disabled unused ports reduce physical access risk.'),
    q('security-17', 'Which management method is safer for a switch CLI session?', 'SSH over a management VLAN', ['Telnet over guest Wi-Fi', 'SSH over a management VLAN', 'TFTP from any subnet', 'HTTP from the internet'], 'Encrypted access from a trusted management segment is safer.'),
    q('security-18', 'Which idea says users and devices should receive only the access they need?', 'Least privilege', ['Least privilege', 'Maximum broadcast', 'Longest prefix only', 'Native VLAN'], 'Least privilege limits unnecessary access.'),
    q('security-19', 'A camera network should not reach payroll systems. What design principle applies?', 'Segmentation', ['Segmentation', 'Port mirroring', 'NTP stratum', 'Email retrieval'], 'Segmentation separates device groups and controls traffic between them.'),
    q('security-20', 'Which authentication service is often used for network device admin logins or VPN access?', 'RADIUS', ['RADIUS', 'HTTP', 'NTP', 'OSPF'], 'RADIUS commonly centralizes network access authentication.')
  ]
};

const wirelessModule: LearningModule = {
  id: 'wireless',
  title: 'Wireless & Physical Networking',
  subtitle: 'Practice Wi-Fi, cabling, ports, PoE, signal issues, and physical installation clues.',
  difficulty: 'Beginner',
  tags: ['wireless', 'SSID', 'AP', 'PoE', 'cabling', 'physical layer'],
  lesson: [
    'Wireless and physical networking questions often ask you to match symptoms to signal, cable, power, or installation problems.',
    'An AP provides Wi-Fi access. An SSID is the wireless network name that clients join.',
    'Copper, fiber, PoE, link lights, port speed, interference, and cable distance all matter when troubleshooting connectivity.'
  ],
  learningSections: [
    {
      title: 'Wireless basics',
      points: [
        'An AP bridges wireless clients into the wired network.',
        'An SSID is the visible or configured Wi-Fi network name.',
        'Weak signal, interference, or wrong credentials can stop clients from connecting reliably.'
      ]
    },
    {
      title: 'Physical basics',
      points: [
        'PoE can power phones, cameras, and access points through Ethernet cabling.',
        'Bad cables, wrong patching, or disabled ports can prevent link from coming up.',
        'Fiber connections can fail if the transmit and receive strands are reversed.'
      ]
    },
    {
      title: 'Scenario clues',
      points: [
        'No link light points to cable, port, power, or physical layer checks.',
        'A powered AP that will not serve clients points to SSID, security, VLAN, or upstream issues.',
        'Voice or camera devices without power may point to PoE.'
      ]
    }
  ],
  labTitle: 'Wireless and physical practice',
  steps: [
    q('wireless-01', 'What device provides Wi-Fi access to wireless clients?', 'Access point', ['Access point', 'Patch panel', 'DNS server', 'RADIUS accounting log'], 'An access point lets wireless clients connect to the network.'),
    q('wireless-02', 'What does SSID mean in a Wi-Fi network?', 'The wireless network name', ['The wireless network name', 'The subnet mask', 'The switch port number', 'The broadcast address'], 'The SSID is the wireless network name clients join.'),
    q('wireless-03', 'A ceiling AP has Ethernet plugged in but no separate power brick. What might power it?', 'PoE', ['PoE', 'POP3', 'BGP', 'NTP'], 'Power over Ethernet can power access points through the network cable.'),
    q('wireless-04', 'A VoIP phone powers on from the switch port. What feature is being used?', 'PoE', ['PoE', 'SNMP trap', 'Native VLAN', 'OSPF'], 'PoE can power phones over Ethernet cabling.'),
    q('wireless-05', 'A copper Ethernet link has no link light. What should you check early?', 'Cable and switch port', ['Cable and switch port', 'Patch-panel connection', 'NIC status and speed setting', 'Switchport shutdown state'], 'No link light often points to physical cable, port, or power issues.'),
    q('wireless-06', 'Which cable type uses light instead of electrical signals?', 'Fiber', ['Fiber', 'Coax only', 'Console cable', 'Copper twisted pair'], 'Fiber optic cabling carries light signals.'),
    q('wireless-07', 'A fiber link stays down after patching. Which physical issue is common?', 'TX/RX strands are reversed', ['TX/RX strands are reversed', 'DNS is missing', 'DHCP lease is too long', 'SMTP is blocked'], 'Fiber links need transmit and receive strands connected correctly.'),
    q('wireless-08', 'What issue means signal from one copper pair interferes with another?', 'Crosstalk', ['Crosstalk', 'NTP drift', 'VLAN pruning', 'Route summarization'], 'Crosstalk is interference between cable pairs or nearby cables.'),
    q('wireless-09', 'Which wireless issue is most likely if clients connect but drop when far from the AP?', 'Weak signal', ['Weak signal', 'Wrong SMTP port', 'Too many host bits', 'Bad broadcast address only'], 'Distance and obstacles can weaken wireless signal.'),
    q('wireless-10', 'What should an AP map or heat map help identify?', 'Coverage gaps', ['Coverage gaps', 'DHCP ports', 'Mail protocols', 'Subnet masks only'], 'Wireless surveys help find areas with weak or missing coverage.'),
    q('wireless-11', 'Which band usually has shorter range but more channel capacity than 2.4 GHz?', '5 GHz', ['5 GHz', '900 MHz', 'AM radio', 'Infrared only'], '5 GHz usually has shorter range than 2.4 GHz but more non-overlapping channel options.'),
    q('wireless-12', 'Which band is often more crowded because many devices use it?', '2.4 GHz', ['2.4 GHz', 'Fiber core', 'Console rollover', 'LDAP'], '2.4 GHz is commonly crowded and can experience interference.'),
    q('wireless-13', 'What hardware organizes many cable runs in a rack but does not switch traffic by itself?', 'Patch panel', ['Patch panel', 'Access point', 'Firewall', 'DHCP scope'], 'Patch panels terminate and organize cabling.'),
    q('wireless-14', 'Which device forwards Ethernet frames using MAC addresses?', 'Switch', ['Switch', 'Modem only', 'NTP server', 'Printer driver'], 'Switches forward frames using MAC address tables.'),
    q('wireless-15', 'Which device forwards packets between different IP networks?', 'Router', ['Router', 'Patch panel', 'Hub', 'Cable tray'], 'Routers forward traffic between networks.'),
    q('wireless-16', 'A network camera is mounted where there is no outlet. Which switch feature may help?', 'PoE', ['PoE', 'IMAP', 'BGP', 'Syslog'], 'PoE can power cameras through Ethernet.'),
    q('wireless-17', 'Which connector is commonly associated with copper Ethernet patch cables?', 'RJ45', ['RJ45', 'LC', 'SC', 'F-type'], 'RJ45 is the common connector for twisted-pair Ethernet patch cables.'),
    q('wireless-18', 'Which connector type is commonly associated with fiber?', 'LC', ['RJ45', 'LC', 'F-type', 'DB9 only'], 'LC is a common fiber connector.'),
    q('wireless-19', 'Which symptom most strongly points to a physical layer issue?', 'No link light', ['No link light', 'Wrong website title', 'Expired email folder', 'Long username'], 'No link light is a strong physical connectivity clue.'),
    q('wireless-20', 'Which installation concern matters for rack-mounted network gear?', 'Power load and airflow', ['Power load and airflow', 'Cable management and bend radius', 'Rack unit spacing', 'UPS capacity and cooling'], 'Network equipment needs proper power and cooling.')
  ]
};

const troubleshootingModule: LearningModule = {
  id: 'troubleshooting',
  title: 'Troubleshooting',
  subtitle: 'Practice symptoms, likely causes, and first checks for common Network+ scenarios.',
  difficulty: 'Intermediate',
  tags: ['troubleshooting', 'DNS', 'DHCP', 'VLANs', 'latency', 'packet loss'],
  lesson: [
    'Troubleshooting is about matching a symptom to the layer or service most likely involved.',
    'Start with the basics: physical link, IP settings, VLAN assignment, gateway, DNS, and the affected scope.',
    'Good troubleshooting narrows the problem instead of changing random settings.'
  ],
  learningSections: [
    {
      title: 'First questions',
      points: [
        'Is one user affected, one VLAN affected, or the whole network affected?',
        'Is there link light and a valid IP address?',
        'Can the client reach the gateway, an IP address, and then a DNS name?'
      ]
    },
    {
      title: 'Common patterns',
      points: [
        'Can ping IP but not names usually points to DNS.',
        'APIPA or no valid address usually points to DHCP or VLAN access.',
        'One VLAN failing across an uplink often points to trunk allowed VLAN settings.'
      ]
    },
    {
      title: 'Performance clues',
      points: [
        'High latency means delay.',
        'Packet loss means traffic is being dropped.',
        'Congestion means too much traffic is competing for available bandwidth.'
      ]
    }
  ],
  labTitle: 'Troubleshooting scenario practice',
  steps: [
    q('trouble-01', 'A user can ping 8.8.8.8 but cannot open websites by name. What should you check first?', 'DNS', ['DNS', 'PoE', 'Native VLAN', 'SMTP'], 'IP connectivity works, but name resolution fails, so DNS is the best first check.'),
    q('trouble-02', 'A PC has no link light. What should you check first?', 'Cable, port, and physical connection', ['Cable, port, and physical connection', 'DNS MX record', 'Email protocol', 'Subnet host count'], 'No link light points to physical connectivity.'),
    q('trouble-03', 'Only VLAN 30 cannot cross between two switches. What is a likely trunk issue?', 'VLAN 30 is missing from the allowed VLAN list', ['VLAN 30 is missing from the allowed VLAN list', 'VLAN 30 was not created on one switch', 'The trunk is pruning VLAN 30', 'The port is operating as an access port'], 'If only one VLAN fails over a trunk, check whether it is allowed.'),
    q('trouble-04', 'A client has an address that was not assigned by DHCP and cannot reach the gateway. What service may have failed?', 'DHCP', ['DHCP', 'SNMP', 'SMTP', 'SSH'], 'Bad or missing automatic addressing often points to DHCP.'),
    q('trouble-05', 'A PC is plugged into the right switch but appears in the wrong department network. What should you check?', 'Access VLAN assignment', ['Access VLAN assignment', 'NTP port', 'Mail attachment size', 'Fiber connector polish'], 'A wrong access VLAN can place a device into the wrong network.'),
    q('trouble-06', 'Two VLANs need to communicate but cannot. What feature may be missing?', 'Inter-VLAN routing', ['Inter-VLAN routing', 'More broadcasts', 'Telnet encryption', 'A shorter hostname'], 'Traffic between VLANs requires routing.'),
    q('trouble-07', 'Voice calls sound choppy during busy periods. Which performance issue is likely?', 'Packet loss or congestion', ['Packet loss or congestion', 'Wrong POP3 folder', 'Native VLAN success', 'Too many DNS names'], 'Voice is sensitive to packet loss, latency, and congestion.'),
    q('trouble-08', 'Users report long delay before pages load, but traffic eventually works. What metric describes delay?', 'Latency', ['Latency', 'Subnet mask', 'SSID name', 'Port number only'], 'Latency is network delay.'),
    q('trouble-09', 'A switch and its neighbor disagree on the native VLAN. What problem is this?', 'Native VLAN mismatch', ['Native VLAN mismatch', 'DHCP lease renewal', 'DNS recursion', 'Email relay'], 'Native VLANs should match on both trunk ends.'),
    q('trouble-10', 'A server can be reached by IP address but not by its hostname. Which record or service area should you inspect?', 'DNS', ['DNS', 'PoE', 'Cable category', 'SNMP trap only'], 'Hostname failure points to DNS.'),
    q('trouble-11', 'An AP is powered but clients receive no IP address on the guest SSID. What should you check?', 'Guest VLAN and DHCP path', ['Guest VLAN and DHCP path', 'SMTP submission', 'Fiber TX/RX only', 'RDP port'], 'Wireless clients still need the correct VLAN path to DHCP.'),
    q('trouble-12', 'A printer moved to another port and disappeared from the print subnet. What is likely wrong?', 'The new port is assigned to the wrong VLAN', ['The new port is assigned to the wrong VLAN', 'The printer changed to HTTPS', 'NTP broke the cable', 'The mask became wireless'], 'Moving ports can change the access VLAN.'),
    q('trouble-13', 'A switch port is administratively disabled. What symptom would you expect?', 'No network connectivity from that port', ['No network connectivity from that port', 'Faster DNS', 'More usable hosts', 'Encrypted broadcasts'], 'A disabled port will not pass client traffic.'),
    q('trouble-14', 'A cable run fails because the signal from wire pairs interferes with each other. What is the issue?', 'Crosstalk', ['Crosstalk', 'Kerberos', 'Subnetting', 'Trunk pruning'], 'Crosstalk is unwanted signal interference between pairs.'),
    q('trouble-15', 'All devices on one switch lose connectivity after an uplink is unplugged. What is the likely problem area?', 'Switch uplink', ['Switch uplink', 'POP3 server', 'NTP stratum', 'Browser cache'], 'The uplink connects that switch to the rest of the network.'),
    q('trouble-16', 'A firewall blocks TCP 443. Which common service is affected?', 'HTTPS', ['HTTPS', 'DNS', 'NTP', 'DHCP client replies'], 'HTTPS uses TCP 443.'),
    q('trouble-17', 'A network monitor stops receiving traps from devices. Which SNMP port may be involved?', '162', ['80', '123', '161', '162'], 'SNMP traps commonly use UDP 162.'),
    q('trouble-18', 'A user says the internet is down, but only one laptop is affected. What is the best scope statement?', 'Single-client issue', ['Single-client issue', 'Entire network outage', 'All VLANs failed', 'Data center outage'], 'Affected scope helps narrow where to troubleshoot.'),
    q('trouble-19', 'A web server works internally but not from another subnet. What should you check?', 'Routing or firewall rules', ['Routing or firewall rules', 'Default gateway settings', 'ACLs between subnets', 'Return route configuration'], 'Cross-subnet access depends on routing and allowed traffic.'),
    q('trouble-20', 'Which habit best fits a troubleshooting methodology?', 'Identify the problem before changing settings', ['Identify the problem before changing settings', 'Change many settings at once', 'Ignore scope', 'Skip testing'], 'A methodical approach reduces guesswork and makes fixes verifiable.')
  ]
};

const secGeneralModule: LearningModule = {
  id: 'sec_general',
  certification: 'Security+',
  title: 'General Security Concepts',
  subtitle: 'Practice CIA triad, AAA, security controls, Zero Trust, cryptography basics, and physical security.',
  difficulty: 'Beginner+',
  tags: ['CIA triad', 'AAA', 'Zero Trust', 'security controls', 'cryptography'],
  lesson: [
    'Security+ starts with the goals of security: confidentiality, integrity, and availability.',
    'AAA explains how systems verify identity, decide permissions, and record activity.',
    'Controls can be technical, managerial, operational, or physical, and they can prevent, detect, correct, deter, compensate, or direct behavior.'
  ],
  learningSections: [
    {
      title: 'Security goals',
      points: [
        'Confidentiality keeps information private.',
        'Integrity keeps information accurate and trustworthy.',
        'Availability keeps systems reachable when authorized users need them.'
      ]
    },
    {
      title: 'Identity and trust',
      points: [
        'Authentication proves identity.',
        'Authorization decides what an identity can access.',
        'Accounting records actions for review and accountability.'
      ]
    },
    {
      title: 'Controls',
      points: [
        'Preventive controls stop something before it happens.',
        'Detective controls identify that something happened.',
        'Corrective controls help restore normal operation after a problem.'
      ]
    }
  ],
  labTitle: 'General security concept practice',
  steps: [
    q('sec-general-01', 'A file hash changes after a download. Which CIA triad goal is most directly affected?', 'Integrity', ['Confidentiality', 'Integrity', 'Availability', 'Accounting'], 'Integrity is about keeping data accurate and unchanged unless authorized.'),
    q('sec-general-02', 'A database is encrypted so unauthorized users cannot read customer records. Which goal is protected?', 'Confidentiality', ['Availability', 'Confidentiality', 'Accounting', 'Non-repudiation'], 'Encryption helps protect confidentiality.'),
    q('sec-general-03', 'A company adds redundant internet links so users can still work during one ISP outage. Which goal improves?', 'Availability', ['Availability', 'Integrity', 'Confidentiality', 'Non-repudiation'], 'Redundancy helps keep services available.'),
    q('sec-general-04', 'A login system asks for a password and a phone approval. What is this called?', 'MFA', ['MFA', 'DLP', 'NTP', 'NAT'], 'Multi-factor authentication uses more than one factor to prove identity.'),
    q('sec-general-05', 'Which AAA function verifies who a user is?', 'Authentication', ['Authentication', 'Authorization', 'Accounting', 'Archiving'], 'Authentication verifies identity.'),
    q('sec-general-06', 'Which AAA function decides whether a user can open a specific payroll folder?', 'Authorization', ['Authentication', 'Authorization', 'Accounting', 'Encryption'], 'Authorization decides what access is allowed.'),
    q('sec-general-07', 'Which AAA function records that an admin changed a firewall rule?', 'Accounting', ['Accounting', 'Hashing', 'Availability', 'Tokenization'], 'Accounting records activity for later review.'),
    q('sec-general-08', 'Which control type is a security camera if it helps identify suspicious activity?', 'Detective', ['Preventive', 'Detective', 'Corrective', 'Compensating'], 'A camera can detect and record activity.'),
    q('sec-general-09', 'Which control type is a locked door that stops entry before it happens?', 'Preventive', ['Preventive', 'Corrective', 'Directive', 'Detective'], 'Locked doors are preventive physical controls.'),
    q('sec-general-10', 'Which control type is restoring a clean backup after ransomware?', 'Corrective', ['Directive', 'Corrective', 'Deterrent', 'Detective'], 'A corrective control helps restore normal operation after an incident.'),
    q('sec-general-11', 'Which principle says users should get only the permissions they need?', 'Least privilege', ['Least privilege', 'Open trust', 'Shared account use', 'Maximum access'], 'Least privilege limits unnecessary access.'),
    q('sec-general-12', 'Which model assumes no user or device should be trusted automatically?', 'Zero Trust', ['Zero Trust', 'Implicit trust', 'Open relay', 'Flat network'], 'Zero Trust continuously verifies access instead of trusting by location.'),
    q('sec-general-13', 'Which technology uses certificates and public/private keys to support trust?', 'PKI', ['PKI', 'DHCP', 'SNMP', 'RDP'], 'PKI manages certificates and keys.'),
    q('sec-general-14', 'Which process turns readable data into unreadable data without the key?', 'Encryption', ['Hashing', 'Encryption', 'Accounting', 'Patching'], 'Encryption protects data by making it unreadable without a key.'),
    q('sec-general-15', 'Which process creates a fixed value used to verify data integrity?', 'Hashing', ['Hashing', 'Routing', 'Tunneling', 'Tagging'], 'Hashing can confirm whether data changed.'),
    q('sec-general-16', 'Which proof helps prevent a signer from denying they sent a message?', 'Non-repudiation', ['Non-repudiation', 'Availability', 'Crosstalk', 'Latency'], 'Non-repudiation provides evidence that an action occurred.'),
    q('sec-general-17', 'A badge reader at an office entrance is what category of control?', 'Physical', ['Technical', 'Physical', 'Managerial', 'Logical only'], 'Badge readers are physical access controls.'),
    q('sec-general-18', 'A written security policy is what broad category of control?', 'Managerial', ['Managerial', 'Physical only', 'Packet filtering', 'Wireless'], 'Policies and procedures are managerial controls.'),
    q('sec-general-19', 'Which deception tool is a fake system meant to attract attackers?', 'Honeypot', ['Honeypot', 'Firewall', 'Hash', 'Certificate'], 'A honeypot is a decoy system used for deception or detection.'),
    q('sec-general-20', 'Which control tells users what behavior is required, such as a warning banner?', 'Directive', ['Directive', 'Corrective', 'Compensating', 'Recovery'], 'Directive controls guide or require behavior.')
  ]
};

const secThreatsModule: LearningModule = {
  id: 'sec_threats',
  certification: 'Security+',
  title: 'Threats & Mitigations',
  subtitle: 'Practice threat actors, malware, phishing, vulnerabilities, and choosing the right mitigation.',
  difficulty: 'Beginner+',
  tags: ['threat actors', 'malware', 'phishing', 'vulnerability', 'mitigation'],
  lesson: [
    'Threats are possible causes of harm, vulnerabilities are weaknesses, and mitigations reduce risk.',
    'Security+ expects you to recognize attack clues and choose practical defenses.',
    'Many attacks begin with people, such as phishing, pretexting, and other social engineering tactics.'
  ],
  learningSections: [
    {
      title: 'Threat actors',
      points: [
        'Nation-state actors often have strong funding and long-term goals.',
        'Insider threats already have some level of trusted access.',
        'Organized crime is often motivated by financial gain.'
      ]
    },
    {
      title: 'Attack patterns',
      points: [
        'Phishing uses messages to trick users.',
        'Ransomware blocks or encrypts access to data.',
        'Credential attacks try to steal or guess login secrets.'
      ]
    },
    {
      title: 'Mitigations',
      points: [
        'Patch management reduces known vulnerabilities.',
        'MFA lowers the risk of stolen passwords.',
        'User training helps reduce social engineering success.'
      ]
    }
  ],
  labTitle: 'Threat and mitigation practice',
  steps: [
    q('sec-threat-01', 'An email pretends to be payroll and asks users to enter their password on a fake site. What attack is this?', 'Phishing', ['Phishing', 'Crosstalk', 'Hashing', 'NTP drift'], 'Phishing uses deceptive messages to trick users.'),
    q('sec-threat-02', 'Malware encrypts files and demands payment. What type of malware is this?', 'Ransomware', ['Ransomware', 'Spyware', 'Worm', 'Rootkit'], 'Ransomware blocks or encrypts data and demands payment.'),
    q('sec-threat-03', 'A person calls the help desk pretending to be a manager to reset a password. What attack type fits best?', 'Pretexting', ['Pretexting', 'Vishing', 'Business email compromise', 'Phishing'], 'Pretexting uses a fabricated story to manipulate someone.'),
    q('sec-threat-04', 'Which attacker type is most likely motivated by political beliefs or protest?', 'Hacktivist', ['Hacktivist', 'Script kiddie', 'Shadow IT', 'Auditor'], 'Hacktivists are often motivated by political or social causes.'),
    q('sec-threat-05', 'Which attacker type usually has major resources and espionage goals?', 'Nation-state', ['Nation-state', 'Unskilled attacker', 'Accidental user', 'Vendor'], 'Nation-state actors often have strong resources and strategic goals.'),
    q('sec-threat-06', 'An employee intentionally copies customer data before quitting. What type of threat is this?', 'Insider threat', ['Insider threat', 'Crosstalk', 'DNS failure', 'Cable mismatch'], 'Insider threats come from people with internal access.'),
    q('sec-threat-07', 'Which term means a weakness that could be exploited?', 'Vulnerability', ['Vulnerability', 'Availability', 'Certificate', 'Authorization'], 'A vulnerability is a weakness that can be exploited.'),
    q('sec-threat-08', 'Which term means code or a method that takes advantage of a weakness?', 'Exploit', ['Exploit', 'Policy', 'Audit', 'Archive'], 'An exploit takes advantage of a vulnerability.'),
    q('sec-threat-09', 'Which mitigation best reduces risk from known software flaws?', 'Patch management', ['Patch management', 'Longer SSID names', 'More broadcast traffic', 'Default passwords'], 'Patching fixes known vulnerabilities.'),
    q('sec-threat-10', 'Which mitigation best reduces damage from stolen passwords?', 'MFA', ['MFA', 'Hub replacement only', 'POP3', 'Shorter logs'], 'MFA makes stolen passwords less useful by requiring another factor.'),
    q('sec-threat-11', 'Which attack tries many likely passwords against one account?', 'Password spraying', ['Password spraying', 'VLAN hopping', 'Port mirroring', 'NTP syncing'], 'Password spraying tests common passwords, often across accounts.'),
    q('sec-threat-12', 'Which attack captures traffic between two parties by positioning in the middle?', 'On-path attack', ['On-path attack', 'Phishing', 'Shoulder surfing', 'War driving'], 'An on-path attacker intercepts or manipulates communication.'),
    q('sec-threat-13', 'Which social engineering attack watches someone type sensitive information?', 'Shoulder surfing', ['Shoulder surfing', 'Ransomware', 'SQL injection', 'DDoS'], 'Shoulder surfing is observing someone to capture information.'),
    q('sec-threat-14', 'Which attack overwhelms a service so legitimate users cannot reach it?', 'DDoS', ['DDoS', 'Hash collision only', 'LDAP bind', 'Certificate signing'], 'DDoS attacks target availability by flooding a service.'),
    q('sec-threat-15', 'Which web attack inserts database commands through unsafe input?', 'SQL injection', ['SQL injection', 'DNS lookup', 'NTP sync', 'Crosstalk'], 'SQL injection abuses unsafe input handling to affect a database.'),
    q('sec-threat-16', 'Which mitigation helps reduce SQL injection risk?', 'Input validation', ['Input validation', 'Disabling backups', 'Using Telnet', 'Increasing lease time'], 'Input validation and parameterized queries help reduce injection risk.'),
    q('sec-threat-17', 'Which malware hides privileged access from normal tools?', 'Rootkit', ['Rootkit', 'Adware', 'Logic bomb', 'Macro'], 'Rootkits hide deep system access.'),
    q('sec-threat-18', 'Which malware spreads by replicating itself across systems?', 'Worm', ['Worm', 'Certificate', 'Hash', 'Firewall'], 'Worms self-replicate across networks or systems.'),
    q('sec-threat-19', 'Which attack uses a fake wireless network name to trick users into connecting?', 'Evil twin', ['Evil twin', 'Native VLAN', 'DNSSEC', 'Route poisoning only'], 'An evil twin is a rogue wireless network pretending to be legitimate.'),
    q('sec-threat-20', 'Which mitigation helps users identify suspicious emails?', 'Security awareness training', ['Security awareness training', 'Longer cable runs', 'Open guest VLAN', 'Plain HTTP'], 'Training helps users resist phishing and social engineering.')
  ]
};

const secArchitectureModule: LearningModule = {
  id: 'sec_architecture',
  certification: 'Security+',
  title: 'Security Architecture',
  subtitle: 'Practice secure network design, cloud security, segmentation, resilience, and cryptographic placement.',
  difficulty: 'Intermediate',
  tags: ['architecture', 'segmentation', 'cloud', 'resilience', 'encryption'],
  lesson: [
    'Security architecture is about designing systems so they are harder to attack and easier to recover.',
    'Segmentation, secure defaults, redundancy, encryption, and monitoring all shape safer environments.',
    'Cloud and hybrid systems still need identity, access control, logging, encryption, and shared responsibility.'
  ],
  learningSections: [
    {
      title: 'Network design',
      points: [
        'A DMZ separates public-facing systems from the trusted LAN.',
        'Segmentation limits how far an attacker or outage can spread.',
        'Firewalls and access controls enforce allowed traffic between zones.'
      ]
    },
    {
      title: 'Cloud design',
      points: [
        'Cloud customers still configure identity, data access, and many security settings.',
        'CASB can help enforce cloud access policy.',
        'SASE combines networking and security functions for distributed users.'
      ]
    },
    {
      title: 'Resilience',
      points: [
        'Redundancy reduces single points of failure.',
        'Backups support recovery after deletion, corruption, or ransomware.',
        'RTO and RPO help decide recovery design.'
      ]
    }
  ],
  labTitle: 'Security architecture practice',
  steps: [
    q('sec-arch-01', 'Where should public-facing web servers commonly be placed?', 'DMZ', ['DMZ', 'Screened subnet', 'Internal server VLAN', 'Reverse proxy segment'], 'A DMZ separates public-facing systems from the trusted LAN.'),
    q('sec-arch-02', 'Which design limits how far an attacker can move after one system is compromised?', 'Segmentation', ['Segmentation', 'Flat network', 'Open trust', 'Single shared admin account'], 'Segmentation limits lateral movement and blast radius.'),
    q('sec-arch-03', 'Which control filters traffic between network zones?', 'Firewall', ['Firewall', 'WAF', 'Proxy server', 'IDS sensor'], 'Firewalls enforce traffic rules between zones.'),
    q('sec-arch-04', 'Which solution helps protect a web application from common web attacks?', 'WAF', ['WAF', 'NTP', 'POP3', 'TFTP'], 'A WAF filters web application traffic.'),
    q('sec-arch-05', 'Which technology creates an encrypted tunnel for remote users?', 'VPN', ['VPN', 'SNMP', 'DHCP', 'SMTP'], 'VPNs create encrypted tunnels across untrusted networks.'),
    q('sec-arch-06', 'Which design removes a single point of failure?', 'Redundancy', ['Redundancy', 'One firewall only', 'One power supply only', 'One uplink only'], 'Redundancy adds alternate paths or components.'),
    q('sec-arch-07', 'Which metric defines how quickly a service should be restored?', 'RTO', ['RTO', 'RPO', 'SSID', 'MFA'], 'RTO is the recovery time objective.'),
    q('sec-arch-08', 'Which metric defines acceptable data loss measured in time?', 'RPO', ['RPO', 'RTO', 'AAA', 'NAT'], 'RPO is the recovery point objective.'),
    q('sec-arch-09', 'Which tool helps enforce security policy for cloud service use?', 'CASB', ['CASB', 'POP3', 'VLAN 1', 'RJ45'], 'A CASB helps control access to cloud services.'),
    q('sec-arch-10', 'Which model combines network and security functions for distributed access?', 'SASE', ['SASE', 'TFTP', 'SMTP', 'BGP only'], 'SASE combines security and networking functions.'),
    q('sec-arch-11', 'What protects stored data if a laptop is lost?', 'Full-disk encryption', ['Full-disk encryption', 'Open Wi-Fi', 'More broadcasts', 'Shorter passwords'], 'Full-disk encryption protects data at rest.'),
    q('sec-arch-12', 'What protects data while it crosses a network?', 'Encryption in transit', ['Encryption in transit', 'Plain HTTP', 'Open shares', 'Default VLAN'], 'Encryption in transit protects data moving across networks.'),
    q('sec-arch-13', 'Which design places security controls close to each workload instead of only at the perimeter?', 'Microsegmentation', ['Microsegmentation', 'Flat switching', 'Single subnet', 'Hub network'], 'Microsegmentation applies smaller trust boundaries.'),
    q('sec-arch-14', 'Which principle reduces unnecessary services and weak defaults before deployment?', 'Hardening', ['Hardening', 'Broadcasting', 'Crosstalk', 'Jitter'], 'Hardening reduces attack surface.'),
    q('sec-arch-15', 'Which backup property matters most when ransomware encrypts production data?', 'Recoverable clean copies', ['Recoverable clean copies', 'One local copy only', 'No testing', 'Open write access'], 'Backups must be clean, protected, and restorable.'),
    q('sec-arch-16', 'Which environment separates development experiments from production systems?', 'Sandbox', ['Sandbox', 'Flat VLAN', 'Native trunk', 'Public folder'], 'A sandbox isolates testing from production.'),
    q('sec-arch-17', 'Which cloud concept says provider and customer each have security duties?', 'Shared responsibility', ['Shared responsibility', 'No responsibility', 'Single admin', 'Implicit trust'], 'Cloud security is shared between provider and customer.'),
    q('sec-arch-18', 'Which architecture is best for private app access without broad network trust?', 'Zero Trust architecture', ['Zero Trust architecture', 'Open VPN for everyone', 'Flat LAN', 'Guest VLAN for admins'], 'Zero Trust verifies access per user, device, and policy.'),
    q('sec-arch-19', 'Which device placement commonly inspects traffic entering a protected network?', 'Network security appliance at the boundary', ['Network security appliance at the boundary', 'Inline IPS behind the edge router', 'Firewall between trust zones', 'Proxy at the internet egress point'], 'Boundary controls inspect traffic between trust zones.'),
    q('sec-arch-20', 'Which design helps a service survive one server failure?', 'Load balancing across multiple servers', ['Load balancing across multiple servers', 'Active-passive failover only', 'Cold standby with manual restore', 'Single server with frequent snapshots'], 'Load balancing can improve availability and resilience.')
  ]
};

const secOperationsModule: LearningModule = {
  id: 'sec_operations',
  certification: 'Security+',
  title: 'Security Operations',
  subtitle: 'Practice monitoring, logs, incident response, vulnerability management, and daily security work.',
  difficulty: 'Intermediate',
  tags: ['SIEM', 'incident response', 'logs', 'vulnerability management', 'forensics'],
  lesson: [
    'Security operations is the day-to-day work of detecting, investigating, containing, and improving security.',
    'Logs, alerts, vulnerability scans, baselines, and incident response steps help teams act with evidence.',
    'Security+ questions often ask what to do next in a scenario.'
  ],
  learningSections: [
    {
      title: 'Monitoring',
      points: [
        'SIEM tools collect and correlate logs.',
        'IDS tools alert on suspicious traffic.',
        'IPS tools can block suspicious traffic.'
      ]
    },
    {
      title: 'Response',
      points: [
        'Containment limits damage during an incident.',
        'Eradication removes the cause.',
        'Recovery restores normal service.'
      ]
    },
    {
      title: 'Evidence',
      points: [
        'Forensics needs careful evidence handling.',
        'Chain of custody records who handled evidence.',
        'Time synchronization helps correlate logs.'
      ]
    }
  ],
  labTitle: 'Security operations practice',
  steps: [
    q('sec-ops-01', 'Which tool collects and correlates logs from many systems?', 'SIEM', ['SIEM', 'DHCP', 'POP3', 'NAT'], 'A SIEM centralizes and correlates security event data.'),
    q('sec-ops-02', 'Which tool alerts on suspicious network activity but does not block it by itself?', 'IDS', ['IDS', 'IPS', 'DLP', 'VPN'], 'An IDS detects and alerts.'),
    q('sec-ops-03', 'Which tool can detect and block suspicious traffic inline?', 'IPS', ['IPS', 'IDS', 'NTP', 'SMTP'], 'An IPS can prevent or block detected activity.'),
    q('sec-ops-04', 'Which endpoint tool helps investigate and contain suspicious activity on laptops?', 'EDR', ['EDR', 'DHCP', 'IMAP', 'BGP'], 'EDR monitors endpoints and supports investigation and response.'),
    q('sec-ops-05', 'Which control helps stop sensitive files from being emailed outside the company?', 'DLP', ['DLP', 'NTP', 'SNMP', 'RDP'], 'DLP helps detect and prevent data leakage.'),
    q('sec-ops-06', 'During an active incident, which step limits damage first?', 'Containment', ['Containment', 'Lessons learned', 'Policy review only', 'Asset disposal'], 'Containment reduces spread and impact.'),
    q('sec-ops-07', 'After containing malware, which step removes the malware and root cause?', 'Eradication', ['Eradication', 'Preparation', 'Detection', 'Reporting only'], 'Eradication removes the cause of the incident.'),
    q('sec-ops-08', 'Which step restores systems to normal operation after eradication?', 'Recovery', ['Recovery', 'Reconnaissance', 'Accounting', 'Tagging'], 'Recovery brings services back safely.'),
    q('sec-ops-09', 'Which document records who handled evidence and when?', 'Chain of custody', ['Chain of custody', 'Subnet table', 'DNS zone', 'VLAN tag'], 'Chain of custody tracks evidence handling.'),
    q('sec-ops-10', 'Which activity identifies missing patches and weak configurations?', 'Vulnerability scanning', ['Vulnerability scanning', 'Port mirroring only', 'Cable toning', 'Email retrieval'], 'Vulnerability scanning finds known weaknesses.'),
    q('sec-ops-11', 'Which activity confirms whether a patch fixed a known weakness?', 'Rescanning', ['Rescanning', 'Disabling logs', 'Deleting backups', 'Sharing passwords'], 'Rescanning verifies remediation.'),
    q('sec-ops-12', 'Which data source helps show what happened before and after a suspicious login?', 'Logs', ['Logs', 'Cable labels only', 'Patch colors', 'Monitor size'], 'Logs provide activity records.'),
    q('sec-ops-13', 'Why is NTP important for security investigations?', 'It keeps timestamps consistent', ['It keeps timestamps consistent', 'It encrypts all traffic', 'It blocks phishing', 'It assigns VLANs'], 'Time sync helps correlate events across systems.'),
    q('sec-ops-14', 'Which response is best when a host is actively spreading malware?', 'Isolate the host', ['Isolate the host', 'Ignore alerts', 'Add guest Wi-Fi', 'Open all ports'], 'Isolation helps contain the spread.'),
    q('sec-ops-15', 'Which process turns a repeated manual response into an automated workflow?', 'SOAR playbook', ['SOAR playbook', 'DHCP lease', 'Subnet mask', 'Fiber map'], 'SOAR can automate security workflows.'),
    q('sec-ops-16', 'Which action reduces risk from unsupported software?', 'Remove, replace, or isolate it', ['Remove, replace, or isolate it', 'Give it internet admin access', 'Disable backups', 'Use Telnet only'], 'Unsupported software should be removed, upgraded, or isolated.'),
    q('sec-ops-17', 'Which alert is most urgent?', 'Confirmed credential theft on an admin account', ['Confirmed credential theft on an admin account', 'Repeated failed logins from one user', 'Malware blocked on a test machine', 'A low-severity vulnerability scan finding'], 'Admin credential theft can have major impact.'),
    q('sec-ops-18', 'Which practice helps restore files after accidental deletion?', 'Backups', ['Backups', 'Open shares', 'Plaintext passwords', 'No logging'], 'Backups support recovery.'),
    q('sec-ops-19', 'Which term describes normal expected system behavior used for comparison?', 'Baseline', ['Baseline', 'Exploit', 'Ransomware', 'Honeytoken'], 'A baseline helps spot unusual behavior.'),
    q('sec-ops-20', 'Which post-incident step captures what worked and what should improve?', 'Lessons learned', ['Lessons learned', 'Initial infection', 'Containment only', 'Port scan'], 'Lessons learned improves future response.')
  ]
};

const secGovernanceModule: LearningModule = {
  id: 'sec_governance',
  certification: 'Security+',
  title: 'Governance, Risk & Compliance',
  subtitle: 'Practice policies, risk, audits, change management, vendor oversight, and recovery planning.',
  difficulty: 'Intermediate',
  tags: ['governance', 'risk', 'compliance', 'change management', 'BCP', 'DRP'],
  lesson: [
    'Security governance turns security goals into policies, roles, processes, and evidence.',
    'Risk work identifies what could go wrong, how bad it would be, and what controls reduce it.',
    'Compliance and audits check whether requirements are actually being followed.'
  ],
  learningSections: [
    {
      title: 'Risk work',
      points: [
        'Risk combines likelihood and impact.',
        'Mitigation reduces risk with controls.',
        'Risk acceptance means leadership knowingly accepts remaining risk.'
      ]
    },
    {
      title: 'Governance',
      points: [
        'Policies set high-level rules.',
        'Standards define required specifics.',
        'Procedures give step-by-step instructions.'
      ]
    },
    {
      title: 'Continuity',
      points: [
        'A BCP keeps business functions running.',
        'A DRP restores IT systems after disruption.',
        'RTO and RPO shape recovery plans.'
      ]
    }
  ],
  labTitle: 'Governance and risk practice',
  steps: [
    q('sec-gov-01', 'Which term combines likelihood and impact?', 'Risk', ['Risk', 'Hash', 'SSID', 'Ciphertext'], 'Risk considers likelihood and impact.'),
    q('sec-gov-02', 'Which choice means leadership knowingly accepts remaining risk?', 'Risk acceptance', ['Risk acceptance', 'Risk ignorance', 'Risk encryption', 'Risk subnetting'], 'Risk acceptance is a deliberate decision to accept residual risk.'),
    q('sec-gov-03', 'Which response transfers financial impact to another party?', 'Cyber insurance', ['Cyber insurance', 'Open Wi-Fi', 'No backups', 'Shared admin passwords'], 'Insurance transfers some financial risk.'),
    q('sec-gov-04', 'Which document gives high-level rules for acceptable technology use?', 'AUP', ['AUP', 'RTO', 'SSID', 'VLAN tag'], 'An acceptable use policy defines proper system use.'),
    q('sec-gov-05', 'Which document gives step-by-step instructions?', 'Procedure', ['Procedure', 'Policy', 'Risk appetite', 'Certificate'], 'Procedures are step-by-step instructions.'),
    q('sec-gov-06', 'Which document states mandatory specific requirements, such as minimum password length?', 'Standard', ['Standard', 'Guideline only', 'Incident', 'Exploit'], 'Standards define required specifics.'),
    q('sec-gov-07', 'Which process should approve and document firewall rule changes?', 'Change management', ['Change management', 'Phishing', 'Port scanning', 'War driving'], 'Change management controls changes and records approvals.'),
    q('sec-gov-08', 'What should a change plan include in case the change fails?', 'Backout plan', ['Backout plan', 'Open guest account', 'Deleted logs', 'Plaintext password'], 'A backout plan explains how to reverse a failed change.'),
    q('sec-gov-09', 'Which review checks whether controls meet requirements?', 'Audit', ['Audit', 'DHCP lease', 'VLAN trunk', 'Ping sweep only'], 'Audits evaluate controls and evidence.'),
    q('sec-gov-10', 'Which term means meeting required laws, regulations, standards, or policies?', 'Compliance', ['Compliance', 'Compression', 'Broadcasting', 'Crosstalk'], 'Compliance means meeting required obligations.'),
    q('sec-gov-11', 'Which plan keeps critical business functions operating during disruption?', 'BCP', ['BCP', 'RDP', 'SNMP', 'POP3'], 'A business continuity plan keeps business functions going.'),
    q('sec-gov-12', 'Which plan restores IT systems after a major outage?', 'DRP', ['DRP', 'DLP', 'DNS', 'DHCP'], 'A disaster recovery plan restores IT systems.'),
    q('sec-gov-13', 'Which metric states how quickly a system must be restored?', 'RTO', ['RTO', 'RPO', 'AUP', 'MFA'], 'RTO is recovery time objective.'),
    q('sec-gov-14', 'Which metric states how much data loss is acceptable?', 'RPO', ['RPO', 'RTO', 'SLA', 'SSID'], 'RPO is recovery point objective.'),
    q('sec-gov-15', 'Which agreement defines expected service performance or availability?', 'SLA', ['SLA', 'CIA triad', 'Hash', 'Exploit'], 'An SLA defines service expectations.'),
    q('sec-gov-16', 'Which process evaluates security risk from outside suppliers?', 'Vendor assessment', ['Vendor assessment', 'Cable testing', 'DHCP renewal', 'SSID broadcast'], 'Vendor assessments review third-party risk.'),
    q('sec-gov-17', 'Which term describes the amount of risk an organization is willing to accept?', 'Risk appetite', ['Risk appetite', 'Attack vector', 'Broadcast storm', 'MAC address'], 'Risk appetite defines acceptable risk level.'),
    q('sec-gov-18', 'Which legal requirement may control how personal data is handled?', 'Privacy regulation', ['Privacy regulation', 'Cable category', 'Native VLAN', 'NTP stratum'], 'Privacy regulations govern personal data handling.'),
    q('sec-gov-19', 'Which record helps prove users completed required security training?', 'Training evidence', ['Training evidence', 'Open ports only', 'Subnet mask', 'DHCP option'], 'Training records provide compliance evidence.'),
    q('sec-gov-20', 'Which action should happen before deploying a major production change?', 'Approval and testing', ['Approval and testing', 'Emergency change after deployment', 'Verbal approval without validation', 'Post-change documentation only'], 'Major changes should be approved, tested, and documented.')
  ]
};

const secCybersecurityModule: LearningModule = {
  id: 'sec_cybersecurity',
  certification: 'Security+',
  title: 'Cybersecurity Foundations',
  subtitle: 'Practice the core cybersecurity list: CIA, analyst duties, PII, compliance, threats, Linux, SQL, and attack surface basics.',
  difficulty: 'Beginner',
  tags: ['cybersecurity', 'PII', 'compliance', 'Linux', 'SQL', 'attack vectors'],
  lesson: [
    'Cybersecurity protects networks, devices, people, and data from unauthorized access or criminal exploitation.',
    'Entry-level analysts often monitor systems, protect information, search for weaknesses, and help respond to incidents.',
    'The pasted study list is built into this section as focused practice questions and glossary definitions.'
  ],
  learningSections: [
    {
      title: 'Security basics',
      points: [
        'The CIA triad stands for confidentiality, integrity, and availability.',
        'Security controls reduce specific risks and help protect information.',
        'Compliance means following internal standards and external regulations.'
      ]
    },
    {
      title: 'Threats and data',
      points: [
        'PII can identify a person, while SPII is more sensitive and needs stricter handling.',
        'Threat actors may be external attackers, insiders, vendors, or trusted partners.',
        'Social engineering uses manipulation tactics such as authority, urgency, scarcity, and trust.'
      ]
    },
    {
      title: 'Analyst tools',
      points: [
        'Linux CLI commands help analysts inspect files, permissions, and logs.',
        'SQL queries help analysts search log tables and security records.',
        'Vulnerability assessments identify weaknesses so teams can reduce attack vectors.'
      ]
    }
  ],
  labTitle: 'Cybersecurity foundations practice',
  steps: [
    q('cyber-01', 'Cybersecurity is the practice of protecting networks, devices, people, and data while preserving which three goals?', 'Confidentiality, integrity, and availability', ['Speed, storage, and bandwidth', 'Confidentiality, integrity, and availability', 'Routing, switching, and trunking', 'Power, cooling, and cabling'], 'The CIA triad is confidentiality, integrity, and availability.'),
    q('cyber-02', 'Which three responsibilities best fit an entry-level security analyst?', 'Monitor systems, protect information, and search for weaknesses', ['Monitor systems, protect information, and search for weaknesses', 'Approve policy exceptions, negotiate contracts, and manage legal discovery', 'Design enterprise architecture, purchase tools, and sign off risk acceptance', 'Configure every endpoint, manage payroll access, and own vendor contracts'], 'Entry-level analysts commonly monitor systems, protect information, and look for weaknesses.'),
    q('cyber-03', 'What process reviews security records, activities, and related documents?', 'Security audit', ['Security audit', 'Vulnerability assessment', 'Access review', 'Control validation'], 'Security audits review records, activities, and documents for security and compliance.'),
    q('cyber-04', 'Which two outcomes show how security teams bring value to an organization?', 'Compliance and protection against threats', ['Compliance and protection against threats', 'Risk acceptance and reduced monitoring', 'Faster deployment and fewer access reviews', 'More user freedom and fewer technical controls'], 'Security teams help organizations meet requirements and defend against internal and external threats.'),
    q('cyber-05', 'Which set contains transferable skills useful for security analysts?', 'Communication, problem-solving, and time management', ['Communication, problem-solving, and time management', 'Packet capture, firewall tuning, and SQL filtering', 'Risk scoring, malware triage, and access reviews', 'Linux permissions, SIEM searches, and vulnerability scans'], 'Transferable skills include communication, problem-solving, time management, and growth mindset.'),
    q('cyber-06', 'Which set contains technical skills useful for security analysts?', 'SIEM tools, IDS tools, programming, and incident response', ['SIEM tools, IDS tools, programming, and incident response', 'Communication, time management, collaboration, and growth mindset', 'Policy writing, stakeholder updates, meeting facilitation, and training delivery', 'Ethical judgment, curiosity, note-taking, and conflict resolution'], 'Security analysts benefit from SIEM, IDS, programming, threat knowledge, and incident response skills.'),
    q('cyber-07', 'Which type of information can identify or help identify a person?', 'PII', ['PII', 'PHI', 'SPII', 'Confidential business data'], 'Personally identifiable information can identify or help identify an individual.'),
    q('cyber-08', 'Which statement best describes SPII?', 'A stricter, more sensitive type of PII', ['A stricter, more sensitive type of PII', 'Any data created by a public website visitor', 'Internal documentation with no personal data', 'General business data approved for public release'], 'Sensitive PII is a higher-risk type of PII that needs stricter handling.'),
    q('cyber-09', 'What is identity theft?', 'Using stolen personal information to impersonate someone and commit fraud', ['Using stolen personal information to impersonate someone and commit fraud', 'Using stolen credentials to log in without impersonating the victim publicly', 'Collecting public information for a phishing campaign', 'Encrypting files and demanding payment'], 'Identity theft uses personal information to impersonate a victim.'),
    q('cyber-10', 'Which entities can be internal threats?', 'Employees, vendors, and trusted partners', ['Employees, vendors, and trusted partners', 'Only full-time employees with admin access', 'Only users outside the organization', 'Only attackers with no trusted relationship'], 'Internal threats can include employees, vendors, and trusted partners.'),
    q('cyber-11', 'Which malware can duplicate and spread on its own without human involvement?', 'Worm', ['Worm', 'Virus', 'Trojan', 'Spyware'], 'A worm can self-replicate and spread across systems.'),
    q('cyber-12', 'Which malware encrypts data and demands payment to restore access?', 'Ransomware', ['Ransomware', 'Spyware', 'Rootkit', 'Worm'], 'Ransomware blocks or encrypts access and demands payment.'),
    q('cyber-13', 'Which attack uses digital messages to trick people into revealing sensitive data or installing malware?', 'Phishing', ['Phishing', 'Spear phishing', 'Business email compromise', 'Social media phishing'], 'Phishing uses deceptive digital communication.'),
    q('cyber-14', 'Which phishing type targets company executives?', 'Whaling', ['Whaling', 'Smishing', 'Vishing', 'USB baiting'], 'Whaling is spear phishing aimed at executives.'),
    q('cyber-15', 'Which attack uses text messages to trick users?', 'Smishing', ['Smishing', 'Vishing', 'Whaling', 'Watering hole'], 'Smishing is SMS or text-message phishing.'),
    q('cyber-16', 'Which attack uses voice calls or voice messages to trick users?', 'Vishing', ['Vishing', 'Spear phishing', 'USB baiting', 'Spyware'], 'Vishing is voice phishing.'),
    q('cyber-17', 'Which social engineering tactic pressures someone to act quickly?', 'Urgency', ['Urgency', 'Authority', 'Scarcity', 'Familiarity'], 'Urgency pushes people to act before thinking carefully.'),
    q('cyber-18', 'Which social engineering tactic relies on impersonating someone with power?', 'Authority', ['Authority', 'Urgency', 'Consensus', 'Trust'], 'Authority uses perceived power to pressure a victim.'),
    q('cyber-19', 'Which security domain focuses on storage, maintenance, retention, and destruction of data?', 'Asset security', ['Asset security', 'Security operations', 'Security assessment and testing', 'Identity and access management'], 'Asset security includes securing digital and physical assets and managing data handling.'),
    q('cyber-20', 'Which framework is voluntary and uses standards, guidelines, and best practices to manage cybersecurity risk?', 'NIST CSF', ['NIST CSF', 'CIS Controls', 'ISO 27001', 'NIST RMF'], 'The NIST Cybersecurity Framework is voluntary and helps manage cybersecurity risk.'),
    q('cyber-21', 'Which regulation protects payment card information?', 'PCI DSS', ['PCI DSS', 'GDPR', 'HIPAA', 'FedRAMP'], 'PCI DSS helps protect cardholder data and reduce card fraud.'),
    q('cyber-22', 'Which U.S. law protects patients health information?', 'HIPAA', ['HIPAA', 'PCI DSS', 'GDPR', 'FedRAMP'], 'HIPAA protects health information.'),
    q('cyber-23', 'Which privacy regulation protects European Union residents personal data?', 'GDPR', ['GDPR', 'HIPAA', 'PCI DSS', 'SOC 2'], 'GDPR protects personal data for EU residents.'),
    q('cyber-24', 'Which term describes labeling assets based on sensitivity and importance?', 'Asset classification', ['Asset classification', 'Data ownership', 'Data retention', 'Asset inventory'], 'Asset classification labels assets by sensitivity or importance.'),
    q('cyber-25', 'A sent email is traveling across the network. What data state is this?', 'Data in transit', ['Data in transit', 'Data at rest', 'Data archived', 'Data deleted'], 'Data in transit is moving between systems or across a network.'),
    q('cyber-26', 'Files stored on a workstation drive are in what data state?', 'Data at rest', ['Data at rest', 'Data in transit', 'Data in use only', 'Data discarded'], 'Data at rest is stored on media or a system.'),
    q('cyber-27', 'Which Linux command prints the current working directory?', 'pwd', ['pwd', 'cd', 'touch', 'grep'], 'The pwd command prints the working directory.'),
    q('cyber-28', 'Which Linux command searches for a string in a file?', 'grep', ['grep', 'pwd', 'cd', 'head'], 'grep searches text for matching patterns.'),
    q('cyber-29', 'Which SQL keyword filters records that match a condition?', 'WHERE', ['WHERE', 'SELECT', 'JOIN', 'ORDER BY'], 'WHERE filters database rows by a condition.'),
    q('cyber-30', 'What is the difference between an attack vector and an attack surface?', 'An attack vector is a path attackers use; attack surface is the full set of exploitable exposure', ['An attack vector is a path attackers use; attack surface is the full set of exploitable exposure', 'An attack vector is the exposed system list; attack surface is a single exploit path', 'An attack vector is always physical; attack surface is always software-only', 'An attack vector is a defensive control; attack surface is the risk owner'], 'An attack vector is a route into a target; attack surface is the collection of possible exposures.')
  ]
};

const securityPlusModules: LearningModule[] = [
  secCybersecurityModule,
  secGeneralModule,
  secThreatsModule,
  secArchitectureModule,
  secOperationsModule,
  secGovernanceModule
];

type GoogleConcept = {
  term: string;
  clue: string;
  scenario: string;
  explanation: string;
  distractors: string[];
};

const googleDistractors = (concepts: GoogleConcept[], index: number, offset = 1) => {
  const peers = concepts
    .filter((_, peerIndex) => peerIndex !== index)
    .map((concept) => concept.term);

  return [0, 1, 2].map((step) => peers[(index + offset + step * 2) % peers.length]);
};

const googleSteps = (prefix: string, concepts: GoogleConcept[]) =>
  concepts.flatMap((concept, index) => [
    q(
      `${prefix}-${String(index * 2 + 1).padStart(2, '0')}`,
      `Which Google Cybersecurity Certificate concept matches this clue: ${concept.clue}?`,
      concept.term,
      [concept.term, ...googleDistractors(concepts, index)],
      concept.explanation
    ),
    q(
      `${prefix}-${String(index * 2 + 2).padStart(2, '0')}`,
      `A junior analyst sees this situation: ${concept.scenario}. What concept should they focus on?`,
      concept.term,
      [concept.term, ...googleDistractors(concepts, index, 3)],
      concept.explanation
    )
  ]);

const googleModule = (
  id: LearningModule['id'],
  title: string,
  subtitle: string,
  tags: string[],
  lesson: string[],
  learningSections: LearningModule['learningSections'],
  prefix: string,
  concepts: GoogleConcept[],
  difficulty: LearningModule['difficulty'] = 'Beginner+'
): LearningModule => ({
  id,
  certification: 'Google Cyber',
  title,
  subtitle,
  difficulty,
  tags,
  lesson,
  learningSections,
  labTitle: `${title} practice`,
  steps: googleSteps(prefix, concepts)
});

const googleCyberModules: LearningModule[] = [
  googleModule(
    'google_foundations',
    'Google Cyber Foundations',
    'Practice cybersecurity basics, analyst responsibilities, ethics, tools, and professional skills.',
    ['cybersecurity', 'CIA triad', 'ethics', 'analyst skills'],
    [
      'This section follows the Google certificate foundation path: what cybersecurity is, why it matters, and what entry-level analysts do.',
      'Focus on the CIA triad, security controls, ethics, transferable skills, and the daily mindset of monitoring and protecting systems.'
    ],
    [
      {
        title: 'Analyst mindset',
        points: [
          'Monitor systems, protect information, and search for weaknesses.',
          'Communicate clearly with technical and nontechnical stakeholders.',
          'Use curiosity and documentation to turn alerts into evidence.'
        ]
      },
      {
        title: 'Core goals',
        points: [
          'Confidentiality keeps data private.',
          'Integrity keeps data accurate and trustworthy.',
          'Availability keeps systems reachable for authorized users.'
        ]
      },
      {
        title: 'Professional basics',
        points: [
          'Ethics guide responsible access to sensitive data.',
          'Security controls reduce risk.',
          'A portfolio helps show practical skills.'
        ]
      }
    ],
    'google-found',
    [
      { term: 'Cybersecurity', clue: 'protecting networks, devices, people, and data from unauthorized access or exploitation', scenario: 'a company wants to protect data, devices, users, and networks from misuse', explanation: 'Cybersecurity is the broad practice of protecting systems, people, networks, devices, and data.', distractors: ['Subnetting', 'Packet switching', 'Load balancing'] },
      { term: 'CIA triad', clue: 'confidentiality, integrity, and availability as a security model', scenario: 'a team asks whether data is private, accurate, and reachable', explanation: 'The CIA triad organizes the main goals of cybersecurity.', distractors: ['OSI model', 'TCP handshake', 'SQL join'] },
      { term: 'Security controls', clue: 'safeguards that reduce specific security risks', scenario: 'a manager asks for a safeguard to lower phishing risk', explanation: 'Security controls are safeguards used to reduce risk.', distractors: ['Broadcast domains', 'File extensions', 'Port numbers'] },
      { term: 'Ethics', clue: 'doing the right thing when handling systems and sensitive information', scenario: 'an analyst has access to private records but no business reason to view them', explanation: 'Ethics guide responsible behavior when security access is powerful.', distractors: ['Latency', 'NAT', 'Crosstalk'] },
      { term: 'Security audit', clue: 'reviewing security records, activities, and documents', scenario: 'the team reviews access logs and policy evidence before an assessment', explanation: 'A security audit reviews evidence, records, and activities.', distractors: ['Packet capture', 'Password spraying', 'VLAN tagging'] },
      { term: 'SIEM', clue: 'a tool category for collecting and analyzing security events', scenario: 'an analyst searches centralized logs for suspicious sign-ins', explanation: 'SIEM tools collect, correlate, and search security event data.', distractors: ['DHCP', 'POP3', 'BGP'] },
      { term: 'IDS', clue: 'a tool that detects suspicious activity and alerts', scenario: 'a sensor raises an alert about unusual network traffic', explanation: 'An IDS detects and alerts on suspicious activity.', distractors: ['NTP', 'SMTP', 'RDP'] },
      { term: 'Transferable skills', clue: 'communication, problem-solving, time management, and growth mindset', scenario: 'a career changer explains how customer-service communication helps during incidents', explanation: 'Transferable skills from other fields can help cybersecurity work.', distractors: ['Cryptographic keys', 'Cable standards', 'Subnet masks'] },
      { term: 'Technical skills', clue: 'hands-on abilities with tools, procedures, and technologies', scenario: 'an analyst learns Linux, SQL, SIEM tools, and incident response steps', explanation: 'Technical skills apply directly to security tools and workflows.', distractors: ['Consensus', 'Scarcity', 'Authority'] },
      { term: 'Portfolio', clue: 'a collection of projects and evidence showing practical skills', scenario: 'a learner saves Linux, SQL, and incident response examples for job applications', explanation: 'A portfolio helps demonstrate hands-on cybersecurity ability.', distractors: ['Native VLAN', 'Broadcast address', 'Patch panel'] }
    ],
    'Beginner'
  ),
  googleModule(
    'google_risk',
    'Manage Security Risks',
    'Practice risk, frameworks, controls, audits, SIEM dashboards, and incident playbooks.',
    ['risk', 'NIST CSF', 'security controls', 'playbook'],
    [
      'The Google risk course centers on identifying threats, risks, and vulnerabilities, then managing them with frameworks and controls.',
      'Risk work becomes practical when it connects audits, SIEM data, playbooks, and clear decisions.'
    ],
    [
      { title: 'Risk language', points: ['Threats can cause harm.', 'Vulnerabilities are weaknesses.', 'Risk combines likelihood and impact.'] },
      { title: 'Frameworks', points: ['NIST CSF helps manage cybersecurity risk.', 'Controls reduce risk.', 'Audits verify evidence and behavior.'] },
      { title: 'Response prep', points: ['Playbooks make response repeatable.', 'SIEM dashboards help analysts prioritize.', 'Diverse perspectives improve decisions.'] }
    ],
    'google-risk',
    [
      { term: 'Risk', clue: 'the chance that a threat exploits a vulnerability and causes impact', scenario: 'a weakness exists on an internet-facing server and could expose customer data', explanation: 'Risk considers likelihood and impact from threats exploiting vulnerabilities.', distractors: ['SSID', 'Subnet', 'Kernel'] },
      { term: 'Threat', clue: 'a possible cause of harm to assets or systems', scenario: 'a rogue access point could alter or steal sensitive records', explanation: 'A threat is something that can cause harm.', distractors: ['Control', 'Policy', 'Backup'] },
      { term: 'Vulnerability', clue: 'a weakness that could be exploited', scenario: 'a server is missing critical security patches', explanation: 'A vulnerability is a weakness that can be exploited.', distractors: ['Availability', 'Dashboard', 'Procedure'] },
      { term: 'NIST CSF', clue: 'a voluntary framework for managing cybersecurity risk', scenario: 'leadership wants a flexible framework to organize security risk work', explanation: 'NIST CSF provides standards, guidelines, and best practices for cybersecurity risk.', distractors: ['POP3', 'RDP', 'NTP'] },
      { term: 'Security controls', clue: 'safeguards used to reduce risk', scenario: 'a team adds MFA and phishing training to lower account takeover risk', explanation: 'Security controls are safeguards that reduce risk.', distractors: ['Foreign keys', 'Host bits', 'Default gateways'] },
      { term: 'Security audit', clue: 'a structured review of security evidence and activity', scenario: 'an analyst checks whether HR admins have appropriate access permissions', explanation: 'Security audits review records, controls, and evidence.', distractors: ['Packet sniffing', 'War driving', 'Vishing'] },
      { term: 'SIEM dashboard', clue: 'a visual view of security data, alerts, and trends', scenario: 'an analyst reviews panels showing failed logins and suspicious endpoints', explanation: 'SIEM dashboards help analysts interpret security events.', distractors: ['Patch panel', 'Shell prompt', 'Subnet calculator'] },
      { term: 'Playbook', clue: 'documented response steps for a scenario', scenario: 'the team follows repeatable steps for a malware alert', explanation: 'A playbook provides consistent response steps.', distractors: ['Cipher', 'Octet', 'Cable map'] },
      { term: 'Incident response', clue: 'the process for handling security incidents', scenario: 'an analyst detects, contains, and escalates suspicious activity', explanation: 'Incident response organizes how teams handle security events.', distractors: ['Inter-VLAN routing', 'DHCP relay', 'Port forwarding'] },
      { term: 'Security posture', clue: 'the overall state of an organization security readiness', scenario: 'leaders ask whether controls, monitoring, and policies are strong enough', explanation: 'Security posture describes overall security readiness and strength.', distractors: ['MAC table', 'SSID list', 'Query plan'] }
    ]
  ),
  googleModule(
    'google_networks',
    'Networks and Network Security',
    'Practice network models, protocols, firewalls, VPNs, security zones, attacks, and hardening.',
    ['network security', 'firewall', 'VPN', 'hardening'],
    [
      'This track covers how networks communicate and how security teams protect them.',
      'Focus on TCP/IP layers, common devices, firewalls, VPNs, proxies, segmentation, network attacks, and hardening.'
    ],
    [
      { title: 'Network basics', points: ['Devices communicate through protocols.', 'IP addresses identify hosts.', 'TCP/IP layers organize communication.'] },
      { title: 'Network defenses', points: ['Firewalls filter traffic.', 'VPNs protect remote access.', 'Security zones limit trust.'] },
      { title: 'Attack clues', points: ['DoS affects availability.', 'Packet sniffing can expose traffic.', 'Spoofing impersonates a trusted source.'] }
    ],
    'google-net',
    [
      { term: 'TCP/IP model', clue: 'a layered model for network communication', scenario: 'a learner organizes network communication into link, internet, transport, and application layers', explanation: 'The TCP/IP model describes how data moves through networks.', distractors: ['CIA triad', 'Risk register', 'SQL schema'] },
      { term: 'IP address', clue: 'a logical address used to identify a network host', scenario: 'an analyst checks whether a workstation has a valid address before troubleshooting', explanation: 'IP addresses identify hosts on IP networks.', distractors: ['Certificate', 'Hash', 'Policy'] },
      { term: 'Firewall', clue: 'a control that filters network traffic by rules', scenario: 'a team blocks inbound traffic except HTTPS to a web server', explanation: 'Firewalls filter traffic based on rules.', distractors: ['Kernel', 'Primary key', 'Portfolio'] },
      { term: 'VPN', clue: 'an encrypted tunnel for traffic over an untrusted network', scenario: 'remote staff need protected access to internal resources', explanation: 'VPNs provide encrypted tunnels for remote or site-to-site traffic.', distractors: ['SNMP trap', 'Rainbow table', 'Left join'] },
      { term: 'Security zones', clue: 'separate trust areas used to control traffic', scenario: 'public servers are isolated from internal employee devices', explanation: 'Security zones segment systems by trust and function.', distractors: ['File permissions', 'Hash values', 'Mail folders'] },
      { term: 'Proxy server', clue: 'an intermediary that forwards requests between clients and services', scenario: 'internal web requests pass through a filtering gateway', explanation: 'Proxy servers sit between clients and destinations.', distractors: ['Bootloader', 'Touch command', 'Foreign key'] },
      { term: 'DoS attack', clue: 'an attack that disrupts availability by overwhelming a service', scenario: 'a service becomes unreachable after a flood of traffic', explanation: 'DoS attacks target availability.', distractors: ['Integrity check', 'Encryption key', 'SQL join'] },
      { term: 'Packet sniffing', clue: 'capturing network traffic for inspection', scenario: 'an analyst captures packets to investigate strange traffic', explanation: 'Packet sniffing captures network traffic for troubleshooting or analysis.', distractors: ['Asset disposal', 'Data retention', 'Spear phishing'] },
      { term: 'IP spoofing', clue: 'forging source IP information to impersonate another system', scenario: 'traffic appears to come from a trusted address but does not', explanation: 'IP spoofing forges source address information.', distractors: ['Patch management', 'Cloud storage', 'Group permissions'] },
      { term: 'Hardening', clue: 'reducing attack surface by securing configurations', scenario: 'a team disables unused ports and removes default services', explanation: 'Hardening reduces attack surface and weak defaults.', distractors: ['Whaling', 'Smishing', 'Consensus'] }
    ]
  ),
  googleModule(
    'google_linux_sql',
    'Linux, SQL, and Computing Basics',
    'Practice operating systems, Linux shell commands, permissions, SQL queries, and analyst workflows.',
    ['Linux', 'CLI', 'SQL', 'permissions'],
    [
      'Google Cyber learners use operating systems, Linux commands, and SQL to investigate security data.',
      'Focus on command-line basics, file paths, permissions, users, databases, filters, and joins.'
    ],
    [
      { title: 'Operating systems', points: ['The OS helps applications use hardware.', 'GUIs are visual.', 'CLIs use typed commands.'] },
      { title: 'Linux work', points: ['Use pwd and cd to navigate.', 'Use grep to search.', 'Use chmod to change permissions.'] },
      { title: 'SQL work', points: ['SELECT reads data.', 'WHERE filters rows.', 'JOIN combines tables.'] }
    ],
    'google-linux',
    [
      { term: 'Operating system', clue: 'software that helps applications use computer hardware and resources', scenario: 'a browser asks the system to download a file and the OS coordinates the hardware', explanation: 'The operating system manages resources and helps applications run.', distractors: ['Firewall', 'SIEM', 'VLAN'] },
      { term: 'GUI', clue: 'a visual interface with windows, icons, and menus', scenario: 'a user clicks desktop icons and Start menu items', explanation: 'A GUI is a visual way to interact with a system.', distractors: ['CLI', 'SQL', 'PKI'] },
      { term: 'CLI', clue: 'a text interface for entering commands', scenario: 'an analyst types commands to inspect logs quickly', explanation: 'A CLI lets users interact with systems through typed commands.', distractors: ['GUI', 'SSID', 'RPO'] },
      { term: 'Linux shell', clue: 'the command interpreter in Linux', scenario: 'an analyst types commands and receives output or errors', explanation: 'The shell interprets commands and returns output.', distractors: ['DNS zone', 'Access point', 'Cloud bucket'] },
      { term: 'pwd', clue: 'the command that prints the current working directory', scenario: 'a learner needs to know where they are in the filesystem', explanation: 'pwd prints the working directory.', distractors: ['grep', 'chmod', 'sudo'] },
      { term: 'grep', clue: 'the command commonly used to search text', scenario: 'an analyst searches a log file for failed login events', explanation: 'grep searches files or input for matching text.', distractors: ['cd', 'touch', 'cp'] },
      { term: 'chmod', clue: 'the command used to change file permissions', scenario: 'an analyst adds execute permission for a group on a directory', explanation: 'chmod changes file or directory permissions.', distractors: ['head', 'pwd', 'cat'] },
      { term: 'sudo', clue: 'a command used to run tasks with elevated privileges', scenario: 'an analyst needs administrative permission to add a user', explanation: 'sudo runs commands with elevated privileges when authorized.', distractors: ['LEFT JOIN', 'WHERE', 'LIKE'] },
      { term: 'SQL', clue: 'a language for querying relational databases', scenario: 'an analyst searches login records stored in tables', explanation: 'SQL is used to query and manage relational database data.', distractors: ['SSH', 'NTP', 'RDP'] },
      { term: 'INNER JOIN', clue: 'a SQL join returning rows that match in both tables', scenario: 'an analyst combines employees and machines only where employee IDs match', explanation: 'INNER JOIN returns matching rows from both tables.', distractors: ['LEFT JOIN', 'Primary key', 'Wildcard'] }
    ]
  ),
  googleModule(
    'google_assets',
    'Assets, Threats, and Vulnerabilities',
    'Practice asset classification, data states, vulnerability management, attack surfaces, and hardening.',
    ['assets', 'vulnerability', 'attack surface', 'data states'],
    [
      'Assets include data, systems, devices, software, and anything the organization needs to protect.',
      'Threats, vulnerabilities, and attack surfaces become manageable when teams classify assets and prioritize remediation.'
    ],
    [
      { title: 'Assets and data', points: ['Classify assets by sensitivity.', 'Protect data at rest, in transit, and in use.', 'Data owners decide appropriate access.'] },
      { title: 'Vulnerabilities', points: ['Assess weaknesses.', 'Prioritize remediation.', 'Verify fixes with rescanning.'] },
      { title: 'Attack surface', points: ['Reduce exposed paths.', 'Patch systems.', 'Disable unused services and ports.'] }
    ],
    'google-assets',
    [
      { term: 'Asset classification', clue: 'labeling assets by sensitivity and importance', scenario: 'survey data is labeled confidential while a project is in development', explanation: 'Asset classification helps protect assets according to sensitivity and value.', distractors: ['Packet capture', 'Subnetting', 'War driving'] },
      { term: 'Data owner', clue: 'the role that decides who can access, use, or destroy data', scenario: 'a business owner approves who may edit customer records', explanation: 'Data owners are accountable for access and handling decisions.', distractors: ['Default gateway', 'DNS resolver', 'Switch port'] },
      { term: 'Data at rest', clue: 'stored data on a device, server, or database', scenario: 'files sit on a workstation drive while an office move happens', explanation: 'Data at rest is stored rather than actively moving.', distractors: ['Data in transit', 'Data in use', 'Packet loss'] },
      { term: 'Data in transit', clue: 'data moving across a network', scenario: 'an email travels over the network to its destination', explanation: 'Data in transit is moving between systems.', distractors: ['Data at rest', 'Asset disposal', 'Data retention'] },
      { term: 'Data in use', clue: 'data actively accessed or processed', scenario: 'a user opens a customer record in an application', explanation: 'Data in use is actively being accessed or processed.', distractors: ['Cold backup', 'Native VLAN', 'Broadcast domain'] },
      { term: 'Vulnerability assessment', clue: 'an internal review process for finding security weaknesses', scenario: 'a team scans systems to identify missing patches and weak settings', explanation: 'Vulnerability assessments identify weaknesses and reduce exposure.', distractors: ['Business continuity', 'Load balancing', 'Address resolution'] },
      { term: 'Zero-day', clue: 'a previously unknown vulnerability or exploit', scenario: 'attackers exploit a flaw before a patch exists', explanation: 'Zero-day vulnerabilities are unknown or unpatched at the time of exploitation.', distractors: ['RTO', 'SLA', 'SSID'] },
      { term: 'Attack vector', clue: 'a path attackers use to penetrate defenses', scenario: 'a phishing email gives an attacker a route into an account', explanation: 'Attack vectors are paths or methods attackers use.', distractors: ['Attack surface', 'Baseline', 'Risk appetite'] },
      { term: 'Attack surface', clue: 'all exploitable exposure for an asset or environment', scenario: 'an app has many exposed services, weak passwords, and outdated plugins', explanation: 'Attack surface is the set of possible entry points or exposures.', distractors: ['Attack vector', 'Packet size', 'Subnet ID'] },
      { term: 'Security hardening', clue: 'patching, disabling unused ports, and securing defaults', scenario: 'a team removes unnecessary services and keeps systems updated', explanation: 'Security hardening reduces attack surface and exposure.', distractors: ['Smishing', 'Whaling', 'Vishing'] }
    ]
  ),
  googleModule(
    'google_detection',
    'Detection and SIEM Tools',
    'Practice logs, SIEM searches, network telemetry, Splunk, Chronicle, Suricata, and detection logic.',
    ['SIEM', 'logs', 'Splunk', 'Chronicle', 'Suricata'],
    [
      'Detection work turns raw events into security insight.',
      'Google Cyber learners practice searching logs, reading alerts, and using tools such as SIEM platforms and IDS data.'
    ],
    [
      { title: 'Log analysis', points: ['Logs record events.', 'Timestamps must line up.', 'Queries help find meaningful activity.'] },
      { title: 'SIEM tools', points: ['Splunk searches indexed data.', 'Chronicle analyzes security telemetry.', 'Dashboards support triage.'] },
      { title: 'Detection logic', points: ['Rules describe suspicious patterns.', 'Alerts need context.', 'False positives still require review.'] }
    ],
    'google-detect',
    [
      { term: 'Log analysis', clue: 'reviewing recorded events to find activity or evidence', scenario: 'an analyst searches failed sign-ins around the time of an alert', explanation: 'Log analysis finds useful security evidence in event records.', distractors: ['Cable testing', 'Subnetting', 'Whaling'] },
      { term: 'SIEM', clue: 'a platform for collecting, searching, and correlating events', scenario: 'security data from many systems is searchable in one place', explanation: 'SIEM tools centralize and correlate security event data.', distractors: ['DHCP', 'TFTP', 'POP3'] },
      { term: 'Splunk', clue: 'a platform used to search and analyze logs', scenario: 'an analyst writes searches to investigate authentication events', explanation: 'Splunk is commonly used to search and analyze machine data and logs.', distractors: ['Wi-Fi analyzer', 'Cable tester', 'Packet broker only'] },
      { term: 'Chronicle', clue: 'Google security analytics for large-scale telemetry', scenario: 'a team stores and searches security telemetry in a Google platform', explanation: 'Chronicle is Google security analytics for telemetry investigation.', distractors: ['Kerberos', 'RADIUS', 'Syslog only'] },
      { term: 'Suricata', clue: 'an IDS/IPS and network security monitoring tool', scenario: 'a network sensor produces alerts based on suspicious packet patterns', explanation: 'Suricata can detect suspicious network activity.', distractors: ['OAuth', 'GDPR', 'RTO'] },
      { term: 'Packet capture', clue: 'recording network packets for investigation', scenario: 'an analyst captures traffic to inspect source, destination, and protocol fields', explanation: 'Packet capture records traffic for analysis.', distractors: ['Asset classification', 'Risk transfer', 'Single sign-on'] },
      { term: 'tcpdump', clue: 'a command-line packet capture tool', scenario: 'an analyst captures traffic from a terminal on a Linux host', explanation: 'tcpdump captures and displays packets from the command line.', distractors: ['chmod', 'pwd', 'touch'] },
      { term: 'Wireshark', clue: 'a graphical packet analysis tool', scenario: 'an analyst opens a packet file and follows a suspicious connection', explanation: 'Wireshark helps inspect packet captures in detail.', distractors: ['FedRAMP', 'PCI DSS', 'HIPAA'] },
      { term: 'Detection rule', clue: 'logic that identifies suspicious patterns in data', scenario: 'a rule alerts when many failed logins happen quickly', explanation: 'Detection rules describe patterns that may indicate threats.', distractors: ['Foreign key', 'Subnet mask', 'Trunk link'] },
      { term: 'False positive', clue: 'an alert that appears suspicious but is not malicious', scenario: 'a backup job triggers an alert because it looks like unusual file access', explanation: 'False positives require triage so analysts do not chase benign activity forever.', distractors: ['Zero-day', 'Rootkit', 'Worm'] }
    ]
  ),
  googleModule(
    'google_incident',
    'Incident Response and Forensics',
    'Practice incident lifecycle, evidence handling, containment, recovery, and forensic thinking.',
    ['incident response', 'forensics', 'containment', 'recovery'],
    [
      'Incident response turns chaos into a repeatable workflow.',
      'Forensic thinking protects evidence while teams contain damage, remove root causes, and recover safely.'
    ],
    [
      { title: 'Response flow', points: ['Prepare before incidents.', 'Detect and analyze evidence.', 'Contain, eradicate, and recover.'] },
      { title: 'Evidence care', points: ['Preserve evidence.', 'Track chain of custody.', 'Document decisions and timelines.'] },
      { title: 'After action', points: ['Write clear reports.', 'Hold lessons learned.', 'Improve controls and playbooks.'] }
    ],
    'google-ir',
    [
      { term: 'Incident response', clue: 'organized handling of security events', scenario: 'a team follows steps after malware is detected on a workstation', explanation: 'Incident response coordinates how teams handle security incidents.', distractors: ['DNS lookup', 'Subnet mask', 'VLAN access'] },
      { term: 'Preparation', clue: 'planning, tools, training, and playbooks before an incident', scenario: 'a team writes playbooks and confirms contact lists before an alert occurs', explanation: 'Preparation makes response faster and more consistent.', distractors: ['Eradication', 'Recovery', 'Containment'] },
      { term: 'Detection', clue: 'identifying that suspicious activity may be happening', scenario: 'an alert fires after unusual authentication events', explanation: 'Detection identifies possible incidents.', distractors: ['Recovery', 'Lessons learned', 'Backout plan'] },
      { term: 'Analysis', clue: 'determining scope, cause, and impact', scenario: 'an analyst reviews logs to learn which accounts and hosts were involved', explanation: 'Analysis investigates what happened and how serious it is.', distractors: ['DHCP relay', 'Cable map', 'Routing table'] },
      { term: 'Containment', clue: 'limiting spread or damage during an incident', scenario: 'a compromised endpoint is isolated from the network', explanation: 'Containment prevents further harm while investigation continues.', distractors: ['Portfolio', 'Resume', 'STAR method'] },
      { term: 'Eradication', clue: 'removing malware, attacker access, or root cause', scenario: 'malicious files and persistence mechanisms are removed', explanation: 'Eradication removes the cause of the incident.', distractors: ['Reconnaissance', 'Discovery', 'Scanning'] },
      { term: 'Recovery', clue: 'returning systems to normal service safely', scenario: 'a cleaned server is restored and monitored after the incident', explanation: 'Recovery restores normal operation after eradication.', distractors: ['Pretexting', 'Smishing', 'Vishing'] },
      { term: 'Forensics', clue: 'collecting and analyzing evidence carefully', scenario: 'an analyst preserves disk evidence before making changes', explanation: 'Digital forensics handles evidence carefully for investigation.', distractors: ['NAT', 'OSPF', 'DHCP'] },
      { term: 'Chain of custody', clue: 'tracking who handled evidence and when', scenario: 'every evidence handoff is documented during an investigation', explanation: 'Chain of custody preserves evidence integrity and accountability.', distractors: ['Primary key', 'Left join', 'WHERE clause'] },
      { term: 'Lessons learned', clue: 'post-incident review for improvement', scenario: 'the team updates controls and playbooks after an incident closes', explanation: 'Lessons learned improves future detection and response.', distractors: ['Packet loss', 'Crosstalk', 'Jitter'] }
    ],
    'Intermediate'
  ),
  googleModule(
    'google_policies',
    'Policies, Compliance, and Career Prep',
    'Practice policies, compliance, stakeholder communication, resumes, portfolios, and interview readiness.',
    ['policy', 'compliance', 'portfolio', 'resume'],
    [
      'The final Google certificate themes connect security work to organizations, policies, communication, and job readiness.',
      'Practice explaining risk clearly, documenting work, and showing skills through a resume and portfolio.'
    ],
    [
      { title: 'Policy and compliance', points: ['Policies set rules.', 'Procedures explain steps.', 'Compliance verifies obligations.'] },
      { title: 'Communication', points: ['Know your stakeholder.', 'Use clear evidence.', 'Translate technical risk into business impact.'] },
      { title: 'Career readiness', points: ['Build a portfolio.', 'Tailor a resume.', 'Use STAR answers in interviews.'] }
    ],
    'google-policy',
    [
      { term: 'Policy', clue: 'a high-level rule for expected behavior', scenario: 'a company defines how employees may use work systems', explanation: 'Policies define high-level rules and expectations.', distractors: ['Procedure', 'Query', 'Packet'] },
      { term: 'Procedure', clue: 'step-by-step instructions for doing a task', scenario: 'an analyst follows exact steps to escalate a phishing email', explanation: 'Procedures give step-by-step instructions.', distractors: ['Standard', 'Risk', 'Exploit'] },
      { term: 'Compliance', clue: 'meeting required laws, regulations, standards, or policies', scenario: 'a company gathers evidence to prove it follows privacy rules', explanation: 'Compliance means meeting obligations.', distractors: ['Crosstalk', 'Latency', 'Packet loss'] },
      { term: 'AUP', clue: 'a policy defining acceptable technology use', scenario: 'employees read rules for proper use of company computers', explanation: 'An acceptable use policy defines proper system use.', distractors: ['SLA', 'RTO', 'RPO'] },
      { term: 'SLA', clue: 'an agreement for expected service performance', scenario: 'a provider commits to uptime and support response targets', explanation: 'An SLA defines service expectations.', distractors: ['AUP', 'BCP', 'DRP'] },
      { term: 'Stakeholder', clue: 'someone affected by a project, incident, or decision', scenario: 'legal, IT, management, and users all need incident updates', explanation: 'Stakeholders are affected by or involved in decisions and outcomes.', distractors: ['Kernel', 'Shell', 'Bootloader'] },
      { term: 'Risk communication', clue: 'explaining likelihood, impact, and recommended action clearly', scenario: 'an analyst explains why an unpatched server needs priority attention', explanation: 'Risk communication makes security findings understandable and actionable.', distractors: ['VLAN pruning', 'Route summarization', 'Subnetting'] },
      { term: 'Portfolio', clue: 'project evidence showing practical skills', scenario: 'a learner collects Linux, SQL, SIEM, and incident examples for applications', explanation: 'A portfolio shows hands-on ability.', distractors: ['Dashboard', 'Certificate chain', 'MAC table'] },
      { term: 'Resume', clue: 'a professional summary of experience, skills, education, and projects', scenario: 'a learner tailors experience and lab projects for a security analyst role', explanation: 'A resume summarizes qualifications for job applications.', distractors: ['Risk register', 'Playbook', 'Packet capture'] },
      { term: 'STAR method', clue: 'Situation, Task, Action, Result interview format', scenario: 'a candidate structures an answer about solving a difficult lab problem', explanation: 'STAR helps structure interview stories clearly.', distractors: ['CIA triad', 'TCP model', 'AAA'] }
    ]
  )
];

const practiceModules: LearningModule[] = [
  { ...subnettingSource, id: 'subnetting', certification: 'Network+', title: 'IP Addressing & Subnetting' },
  {
    id: 'switching',
    certification: 'Network+',
    title: 'Switching & VLANs',
    subtitle: 'Practice VLAN access ports, segmentation, trunk links, allowed VLANs, native VLANs, and 802.1Q.',
    difficulty: 'Beginner+',
    tags: ['VLANs', 'access ports', 'trunks', '802.1Q', 'native VLAN', 'segmentation'],
    lesson: [...vlanSource.lesson, ...trunkingSource.lesson],
    learningSections: [...vlanSource.learningSections, ...trunkingSource.learningSections],
    labTitle: 'Switching and VLAN scenario practice',
    steps: [...vlanSource.steps, ...trunkingSource.steps]
  },
  { ...portsSource, id: 'ports', certification: 'Network+' },
  { ...servicesModule, certification: 'Network+' },
  { ...securityModule, certification: 'Network+' },
  { ...wirelessModule, certification: 'Network+' },
  { ...troubleshootingModule, certification: 'Network+' }
];

export const modules: LearningModule[] = [
  ...practiceModules,
  {
    id: 'exam',
    certification: 'Network+',
    title: 'Exam Practice',
    subtitle: 'Practice every original question in the app question bank.',
    difficulty: 'Intermediate',
    tags: ['mixed review', 'exam practice', 'Network+ objectives'],
    lesson: [
      'This section combines all original questions from the category banks.',
      'It is not a real CompTIA exam dump. It is designed to test the same skills without copying protected exam items.',
      'Use this after drilling categories so you can practice switching topics quickly.'
    ],
    learningSections: [
      {
        title: 'How to use exam practice',
        points: [
          'Answer everything once without notes to find weak areas.',
          'Review explanations for every missed item.',
          'Return to the category modules for focused 20-question sets.'
        ]
      },
      {
        title: 'What it includes',
        points: [
          'Subnetting math, masks, block size, network and broadcast addresses.',
          'Switching, VLAN access ports, trunking, 802.1Q, native VLANs, and segmentation.',
          'Ports, protocols, network services, security, wireless, physical networking, and troubleshooting.'
        ]
      },
      {
        title: 'Exam-day habit',
        points: [
          'Read the scenario first, then look for what the question is really asking.',
          'Eliminate obviously wrong answers before choosing between close options.',
          'Mark hard questions and keep moving so time does not drain away.'
        ]
      }
    ],
    labTitle: 'Full bank exam practice',
    steps: practiceModules.flatMap((module) =>
      module.steps.map((step) => ({
        ...step,
        id: `${module.id}-${step.id}`,
        prompt: `[${module.title}] ${step.prompt}`
      }))
    )
  },
  ...securityPlusModules,
  {
    id: 'sec_exam',
    certification: 'Security+',
    title: 'Security+ Exam Practice',
    subtitle: 'Practice every original Security+ question in the app question bank.',
    difficulty: 'Intermediate',
    tags: ['Security+', 'SY0-701', 'exam practice'],
    lesson: [
      'This section combines all original Security+ questions from the Security+ category banks.',
      'It is not a real CompTIA exam dump. It uses original questions aligned to Security+ study objectives.',
      'Use the focused Security+ categories first, then use this section for mixed review.'
    ],
    learningSections: [
      {
        title: 'How to use Security+ exam practice',
        points: [
          'Answer without notes to find weak areas.',
          'Review explanations and glossary words after every miss.',
          'Return to General Security, Threats, Architecture, Operations, or Governance for focused review.'
        ]
      },
      {
        title: 'What it includes',
        points: [
          'General security concepts, CIA triad, AAA, Zero Trust, and controls.',
          'Threat actors, malware, social engineering, vulnerabilities, and mitigations.',
          'Security architecture, operations, incident response, governance, risk, and compliance.'
        ]
      },
      {
        title: 'Practice habit',
        points: [
          'Read the scenario carefully and identify the security goal first.',
          'Choose the most practical next step, not just a related term.',
          'Use glossary popups to reinforce new security vocabulary while reviewing.'
        ]
      }
    ],
    labTitle: 'Full Security+ exam practice',
    steps: securityPlusModules.flatMap((module) =>
      module.steps.map((step) => ({
        ...step,
        id: `${module.id}-${step.id}`,
        prompt: `[${module.title}] ${step.prompt}`
      }))
    )
  },
  ...googleCyberModules,
  {
    id: 'google_exam',
    certification: 'Google Cyber',
    title: 'Google Cyber Exam Practice',
    subtitle: 'Practice every original Google Cybersecurity Certificate question in the app question bank.',
    difficulty: 'Intermediate',
    tags: ['Google Cybersecurity Certificate', 'Coursera', 'exam practice'],
    lesson: [
      'This section combines all original Google Cybersecurity Certificate practice questions in this app.',
      'It follows the repository course outline as a topic guide, but the questions and explanations are original study content.',
      'Use the focused Google modules first, then use this section for mixed review.'
    ],
    learningSections: [
      {
        title: 'How to use Google Cyber exam practice',
        points: [
          'Answer without notes to find your weak concepts.',
          'Review glossary words after each missed question.',
          'Return to the matching Google course module for focused 20-question practice.'
        ]
      },
      {
        title: 'What it includes',
        points: [
          'Foundations, risk management, network security, Linux, SQL, and asset protection.',
          'Detection and SIEM tools, incident response, forensics, policies, compliance, and career prep.',
          'Hands-on analyst vocabulary such as SIEM, Splunk, Chronicle, tcpdump, Wireshark, playbooks, and SQL joins.'
        ]
      },
      {
        title: 'Practice habit',
        points: [
          'Tie every answer to a real analyst task.',
          'Look for scenario clues before reading the answer choices.',
          'Use repeated misses to decide which course module to drill next.'
        ]
      }
    ],
    labTitle: 'Full Google Cyber practice',
    steps: googleCyberModules.flatMap((module) =>
      module.steps.map((step) => ({
        ...step,
        id: `${module.id}-${step.id}`,
        prompt: `[${module.title}] ${step.prompt}`
      }))
    )
  }
];
