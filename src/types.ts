export type ModuleId =
  | 'subnetting'
  | 'switching'
  | 'ports'
  | 'services'
  | 'security'
  | 'wireless'
  | 'troubleshooting'
  | 'exam'
  | 'sec_general'
  | 'sec_threats'
  | 'sec_architecture'
  | 'sec_operations'
  | 'sec_governance'
  | 'sec_cybersecurity'
  | 'sec_exam'
  | 'google_foundations'
  | 'google_risk'
  | 'google_networks'
  | 'google_linux_sql'
  | 'google_assets'
  | 'google_detection'
  | 'google_incident'
  | 'google_policies'
  | 'google_exam';

export type SourceModuleId = ModuleId | 'vlans' | 'trunking';

export type LabStep = {
  id: string;
  prompt: string;
  answer: string;
  choices: string[];
  visual?: {
    type: 'trunk' | 'access-vlan' | 'subnet-range' | 'port-flow' | 'generic';
    title: string;
    labels: string[];
    details?: Record<string, string | string[]>;
  };
  acceptedAnswers?: string[];
  explanation: string;
  hint?: string;
};

export type LearningModule = {
  id: ModuleId;
  certification?: 'Network+' | 'Security+' | 'Google Cyber';
  title: string;
  subtitle: string;
  difficulty: 'Beginner' | 'Beginner+' | 'Intermediate';
  tags: string[];
  lesson: string[];
  learningSections: {
    title: string;
    points: string[];
  }[];
  labTitle: string;
  steps: LabStep[];
};

export type ModuleProgress = {
  completed: boolean;
  bestScore: number;
  attempts: number;
  weakTags: string[];
  lastScore: number;
};

export type ProgressState = {
  lastModuleId: ModuleId;
  modules: Record<ModuleId, ModuleProgress>;
};
