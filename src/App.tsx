import { useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Monitor,
  RotateCcw,
  Server,
  Trophy,
  Wifi
} from 'lucide-react';
import { modules } from './data/modules';
import { GlossaryText } from './components/GlossaryText';
import { isCorrectAnswer } from './lib/answers';
import { calculateSubnet } from './lib/subnet';
import { createDefaultProgress, loadProgress, recordAttempt, saveProgress } from './lib/progress';
import type { LearningModule, ModuleId, ProgressState } from './types';

type AnswerState = 'idle' | 'correct' | 'incorrect';

const questionSetSize = 20;

function pickQuestionIds(module: LearningModule) {
  if (module.id === 'exam' || module.id === 'sec_exam' || module.id === 'google_exam') return [...module.steps].sort(() => Math.random() - 0.5).map((step) => step.id);

  return [...module.steps]
    .sort(() => Math.random() - 0.5)
    .slice(0, questionSetSize)
    .map((step) => step.id);
}

function createQuestionSets() {
  return Object.fromEntries(modules.map((module) => [module.id, pickQuestionIds(module)])) as Record<ModuleId, string[]>;
}

function App() {
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress());
  const [selectedModuleId, setSelectedModuleId] = useState<ModuleId>(progress.lastModuleId);
  const [questionSets, setQuestionSets] = useState<Record<ModuleId, string[]>>(() => createQuestionSets());

  const selectedModule = modules.find((module) => module.id === selectedModuleId) ?? modules[0];
  const selectedQuestionIds = questionSets[selectedModule.id] ?? selectedModule.steps.map((step) => step.id);
  const selectedSteps = selectedQuestionIds
    .map((id) => selectedModule.steps.find((step) => step.id === id))
    .filter((step): step is LearningModule['steps'][number] => Boolean(step));
  const moduleGroups = useMemo(
    () => [
      { title: 'Network+', modules: modules.filter((module) => (module.certification ?? 'Network+') === 'Network+') },
      { title: 'Security+', modules: modules.filter((module) => module.certification === 'Security+') },
      { title: 'Google Cybersecurity Certificate', modules: modules.filter((module) => module.certification === 'Google Cyber') }
    ],
    []
  );
  const completedCount = modules.filter((module) => progress.modules[module.id].completed).length;
  const averageBest = Math.round(
    modules.reduce((total, module) => total + progress.modules[module.id].bestScore, 0) / modules.length
  );

  const updateProgress = (next: ProgressState) => {
    setProgress(next);
    saveProgress(next);
  };

  const resetProgress = () => updateProgress(createDefaultProgress());
  const startNewQuestionSet = (moduleId: ModuleId) => {
    const module = modules.find((candidate) => candidate.id === moduleId);
    if (!module || module.id === 'exam' || module.id === 'sec_exam' || module.id === 'google_exam') return;
    setQuestionSets((current) => ({ ...current, [moduleId]: pickQuestionIds(module) }));
  };

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Learning modules">
        <div className="brand">
          <div className="brand-mark">
            <Wifi size={28} strokeWidth={2.6} />
          </div>
          <div>
            <p>Cyber Certs</p>
            <h1>Cyber Cert Lab Trainer</h1>
          </div>
        </div>

        <section className="progress-panel" aria-label="Overall progress">
          <div>
            <span>Completed</span>
            <strong>
              {completedCount}/{modules.length}
            </strong>
          </div>
          <div>
            <span>Avg. best</span>
            <strong>{averageBest}%</strong>
          </div>
        </section>

        <nav className="module-list">
          {moduleGroups.map((group) => (
            <section className="module-group" key={group.title} aria-label={`${group.title} practice`}>
              <h2>{group.title}</h2>
              {group.modules.map((module) => {
                const moduleProgress = progress.modules[module.id];
                const isExam = module.id === 'exam' || module.id === 'sec_exam' || module.id === 'google_exam';
                return (
                  <button
                    className={module.id === selectedModule.id ? 'module-button active' : 'module-button'}
                    key={module.id}
                    onClick={() => setSelectedModuleId(module.id)}
                  >
                    <span>
                      <strong>{module.title}</strong>
                      <small>
                        {isExam ? `${module.steps.length} questions` : `20 of ${module.steps.length} questions`}
                      </small>
                    </span>
                    {moduleProgress.completed ? <CheckCircle2 size={20} /> : <ChevronRight size={20} />}
                  </button>
                );
              })}
            </section>
          ))}
        </nav>

        <button className="reset-button" onClick={resetProgress}>
          <RotateCcw size={18} />
          Reset progress
        </button>
      </aside>

      <section className="content">
        <ModuleView
          key={selectedModule.id}
          module={selectedModule}
          steps={selectedSteps}
          progress={progress}
          onNewSet={() => startNewQuestionSet(selectedModule.id)}
          onComplete={(score, total, weakTags) => updateProgress(recordAttempt(progress, selectedModule.id, score, total, weakTags))}
        />
      </section>
    </main>
  );
}

function ModuleView({
  module,
  steps,
  progress,
  onNewSet,
  onComplete
}: {
  module: LearningModule;
  steps: LearningModule['steps'];
  progress: ProgressState;
  onNewSet: () => void;
  onComplete: (score: number, total: number, weakTags: string[]) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, AnswerState>>({});
  const [showHint, setShowHint] = useState<Record<string, boolean>>({});
  const [completed, setCompleted] = useState(false);

  const moduleProgress = progress.modules[module.id];
  const subnetDemo = useMemo(() => calculateSubnet('192.168.10.34', 27), []);
  const correctCount = steps.filter((step) => feedback[step.id] === 'correct').length;

  const checkAnswer = (stepId: string, selectedAnswer?: string) => {
    const step = steps.find((candidate) => candidate.id === stepId);
    if (!step) return;

    setFeedback((current) => ({
      ...current,
      [stepId]: isCorrectAnswer(step, selectedAnswer ?? answers[stepId] ?? '') ? 'correct' : 'incorrect'
    }));
  };

  const finishLab = () => {
    const missedTags = steps.some((step) => feedback[step.id] !== 'correct') ? module.tags : [];
    onComplete(correctCount, steps.length, missedTags);
    setCompleted(true);
  };

  const resetQuestionSet = () => {
    setAnswers({});
    setFeedback({});
    setShowHint({});
    setCompleted(false);
    onNewSet();
  };

  return (
    <article className="module-view">
      <header className="module-header">
        <div>
          <p className="eyebrow">{module.difficulty} guided lab</p>
          <h2>{module.title}</h2>
          <p><GlossaryText text={module.subtitle} /></p>
        </div>
        <div className="score-card" aria-label="Module progress">
          <Trophy size={24} />
          <span>Best score</span>
          <strong>{moduleProgress.bestScore}%</strong>
        </div>
      </header>

      <section className="lesson-grid">
        <div className="lesson-copy">
          <h3>
            <BookOpen size={22} />
            Quick lesson
          </h3>
          {module.lesson.map((line) => (
            <p key={line}><GlossaryText text={line} /></p>
          ))}
        </div>

        {module.id === 'subnetting' ? (
          <div className="subnet-card" aria-label="Subnet example">
            <span>Worked example</span>
            <strong>{subnetDemo.ip}/27</strong>
            <dl>
              <div>
                <dt>Mask</dt>
                <dd>{subnetDemo.mask}</dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>{subnetDemo.network}</dd>
              </div>
              <div>
                <dt>Broadcast</dt>
                <dd>{subnetDemo.broadcast}</dd>
              </div>
              <div>
                <dt>Usable</dt>
                <dd>
                  {subnetDemo.firstUsable} - {subnetDemo.lastUsable}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="tag-card">
            <span>Practice tags</span>
            <div>
              {module.tags.map((tag) => (
                <b key={tag}><GlossaryText text={tag} /></b>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="learning-panel" aria-label={`${module.title} learning section`}>
        <div className="learning-heading">
          <p className="eyebrow">Learning section</p>
          <h3>Understand it before you drill it</h3>
        </div>
        <div className="learning-sections">
          {module.learningSections.map((section) => (
            <section className="learning-card" key={section.title}>
              <h4>{section.title}</h4>
              <ul>
                {section.points.map((point) => (
                  <li key={point}><GlossaryText text={point} /></li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>

      <section className="lab-panel">
        <div className="lab-heading">
          <div>
            <p className="eyebrow">{module.id === 'subnetting' ? 'Math practice and quiz' : 'Multiple choice practice'}</p>
            <h3>{module.labTitle}</h3>
          </div>
          <div className="lab-actions">
            {module.id !== 'exam' && module.id !== 'sec_exam' && module.id !== 'google_exam' ? (
              <button className="secondary-button" onClick={resetQuestionSet}>
                New question set
              </button>
            ) : null}
            <span>
              {correctCount}/{steps.length} correct
            </span>
          </div>
        </div>

        <div className="steps">
          {steps.map((step, index) => {
            const state = feedback[step.id] ?? 'idle';
            return (
              <section className={`step ${state}`} key={step.id}>
                <div className="step-number">{index + 1}</div>
                <div className="step-body">
                  <label htmlFor={step.id}><GlossaryText text={step.prompt} /></label>
                  <div className="choice-grid" id={step.id}>
                    {step.choices.map((choice) => {
                      const selected = answers[step.id] === choice;
                      return (
                        <button
                          className={selected ? 'choice-button selected' : 'choice-button'}
                          key={choice}
                          onClick={() => {
                            setAnswers((current) => ({ ...current, [step.id]: choice }));
                            checkAnswer(step.id, choice);
                          }}
                        >
                          <GlossaryText text={choice} />
                        </button>
                      );
                    })}
                  </div>
                  <div className="answer-row">
                    {step.hint ? (
                      <button
                        className="icon-button"
                        onClick={() => setShowHint((current) => ({ ...current, [step.id]: !current[step.id] }))}
                        aria-label="Show hint"
                        title="Show hint"
                      >
                        <CircleHelp size={20} />
                      </button>
                    ) : null}
                    {answers[step.id] ? <span className="selected-answer">Selected: <GlossaryText text={answers[step.id]} /></span> : null}
                  </div>

                  {showHint[step.id] && step.hint ? <p className="hint"><GlossaryText text={step.hint} /></p> : null}
                  {state !== 'idle' ? (
                    <>
                      <p className="feedback">
                        <strong>{state === 'correct' ? 'Correct.' : 'Try again.'}</strong> <GlossaryText text={step.explanation} />
                      </p>
                      {step.visual ? <AnswerVisual visual={step.visual} answer={step.answer} /> : null}
                    </>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>

        <footer className="lab-footer">
          <button className="primary-button" onClick={finishLab}>
            Save lab attempt
          </button>
          {completed ? (
            <p>
              Saved. Last score: {Math.round((correctCount / steps.length) * 100)}%.{' '}
              {correctCount === steps.length ? 'Module complete.' : 'Review the missed items and try again.'}
            </p>
          ) : (
            <p>Your progress is saved on this device only.</p>
          )}
        </footer>
      </section>
    </article>
  );
}

function AnswerVisual({ visual, answer }: { visual: NonNullable<LearningModule['steps'][number]['visual']>; answer: string }) {
  const notes = getVisualNotes(visual.type);

  return (
    <aside className={`answer-visual ${visual.type}`} aria-label={visual.title}>
      <div className="visual-heading">
        <span>Visual explanation</span>
        <strong><GlossaryText text={visual.title} /></strong>
      </div>
      <div className="visual-answer-pill">Correct answer: <GlossaryText text={answer} /></div>
      {visual.type === 'trunk' ? <TrunkVisual labels={visual.labels} /> : null}
      {visual.type === 'access-vlan' ? <AccessVlanVisual label={visual.labels[0] ?? answer} details={visual.details} /> : null}
      {visual.type === 'subnet-range' ? <SubnetRangeVisual labels={visual.labels} answer={answer} /> : null}
      {visual.type === 'port-flow' ? <PortFlowVisual labels={visual.labels} /> : null}
      {visual.type === 'generic' ? <GenericVisual labels={visual.labels} /> : null}
      {visual.details ? <VisualDetailList details={visual.details} /> : null}
      <div className="visual-notes">
        {notes.map((note) => (
          <span key={note}><GlossaryText text={note} /></span>
        ))}
      </div>
    </aside>
  );
}

function VisualDetailList({ details }: { details: Record<string, string | string[]> }) {
  return (
    <div className="scenario-detail-list">
      {Object.entries(details).map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong><GlossaryText text={Array.isArray(value) ? value.join(', ') : value} /></strong>
        </div>
      ))}
    </div>
  );
}

function getVisualNotes(type: NonNullable<LearningModule['steps'][number]['visual']>['type']) {
  switch (type) {
    case 'trunk':
      return ['One cable can carry many VLANs', '802.1Q tags identify the VLAN', 'Allowed VLANs control what can cross'];
    case 'access-vlan':
      return ['One end-device port', 'One access VLAN', 'Different VLANs need routing'];
    case 'subnet-range':
      return ['First address = network', 'Middle = usable hosts', 'Last address = broadcast'];
    case 'port-flow':
      return ['Client starts the session', 'Destination port identifies the service', 'Replies return to the client'];
    default:
      return ['Match the concept to the scenario', 'Use the diagram to explain why the answer fits'];
  }
}

function SwitchNode({ label }: { label: string }) {
  return (
    <div className="network-node switch-node">
      <div className="switch-ports">
        <i />
        <i />
        <i />
        <i />
      </div>
      <span>{label}</span>
      <small>Layer 2 switch</small>
    </div>
  );
}

function TrunkVisual({ labels }: { labels: string[] }) {
  const displayLabels = labels.slice(0, 4);

  return (
    <div className="trunk-visual">
      <SwitchNode label="Switch A" />
      <div className="trunk-link" aria-label="802.1Q trunk link">
        <span>TRUNK / 802.1Q</span>
        <div className="vlan-packets">
          {displayLabels.map((label, index) => (
            <b style={{ animationDelay: `${index * 0.45}s` }} key={label}>
              {label}
            </b>
          ))}
        </div>
      </div>
      <SwitchNode label="Switch B" />
      <div className="visual-detail-grid">
        <div>
          <span>Port mode</span>
          <strong><GlossaryText text="Trunk" /></strong>
        </div>
        <div>
          <span>Encapsulation</span>
          <strong><GlossaryText text="802.1Q tags" /></strong>
        </div>
        <div>
          <span>Allowed VLANs</span>
          <strong><GlossaryText text={displayLabels.join(', ')} /></strong>
        </div>
      </div>
      <div className="mini-compare">
        <div>
          <b><GlossaryText text="Access link" /></b>
          <span><GlossaryText text="One VLAN for one endpoint" /></span>
        </div>
        <div className="compare-active">
          <b><GlossaryText text="Trunk link" /></b>
          <span><GlossaryText text="Multiple VLANs over one uplink" /></span>
        </div>
      </div>
      <p><GlossaryText text="Each frame crossing this link is tagged so the receiving device knows which specific VLAN it belongs to." /></p>
    </div>
  );
}

function AccessVlanVisual({ label, details }: { label: string; details?: Record<string, string | string[]> }) {
  const endpoint = typeof details?.Endpoint === 'string' ? details.Endpoint : 'End device';
  return (
    <div className="access-vlan-visual">
      <div className="network-node endpoint-node">
        <Monitor size={30} />
        <span>{endpoint}</span>
        <small>PC, printer, phone, camera</small>
      </div>
      <div className="access-link">
        <span>ACCESS PORT</span>
        <b>{label}</b>
      </div>
      <SwitchNode label="Switch" />
      <div className="visual-detail-grid">
        <div>
          <span>Port mode</span>
          <strong><GlossaryText text="Access" /></strong>
        </div>
        <div>
          <span>Membership</span>
          <strong><GlossaryText text={label} /></strong>
        </div>
        <div>
          <span>Traffic type</span>
          <strong><GlossaryText text="Untagged endpoint traffic" /></strong>
        </div>
      </div>
      <p><GlossaryText text="An access port places the connected endpoint into one VLAN. If the endpoint needs another VLAN, change the access VLAN or route between VLANs." /></p>
    </div>
  );
}

function SubnetRangeVisual({ labels, answer }: { labels: string[]; answer: string }) {
  const subject = labels[0] ?? 'Subnet';
  const match = subject.match(/(\d{1,3}(?:\.\d{1,3}){3})\/(\d+)/);
  const details = match ? calculateSubnet(match[1], Number(match[2])) : null;
  const hostBits = details ? 32 - details.cidr : null;

  return (
    <div className="subnet-range-visual">
      <div className="range-track">
        <span>
          Network
          <b>{details?.network ?? 'first address'}</b>
        </span>
        <span className="usable-zone">
          Usable hosts
          <b>{details ? `${details.firstUsable} - ${details.lastUsable}` : 'middle addresses'}</b>
        </span>
        <span>
          Broadcast
          <b>{details?.broadcast ?? 'last address'}</b>
        </span>
      </div>
      <div className="range-labels">
        <b><GlossaryText text={subject} /></b>
        {details ? <b><GlossaryText text={`Mask: ${details.mask}`} /></b> : null}
        {details ? <b>Usable: {details.usableHosts}</b> : null}
        <b>Answer: <GlossaryText text={answer} /></b>
      </div>
      <div className="subnet-formula">
        <span><GlossaryText text={details ? `Host bits = 32 - ${details.cidr} = ${hostBits}` : 'Host bits = 32 - CIDR'} /></span>
        <span>{details && hostBits !== null ? `Total = 2^${hostBits} = ${2 ** hostBits}` : 'Total addresses = 2^host bits'}</span>
        <span><GlossaryText text={details ? `Usable = ${details.usableHosts}` : 'Usable hosts = total - 2'} /></span>
      </div>
      <p><GlossaryText text="The subnet boundary starts at the network address and ends at the broadcast address. Hosts live between those two boundary addresses." /></p>
    </div>
  );
}

function PortFlowVisual({ labels }: { labels: string[] }) {
  const [protocol = 'SERVICE', port = 'Port'] = labels;
  const transport = ['DNS', 'DHCP', 'SNMP', 'NTP', 'TFTP', 'SYSLOG', 'RADIUS'].includes(protocol) ? 'UDP commonly' : 'TCP commonly';

  return (
    <div className="port-flow-visual">
      <div className="network-node endpoint-node">
        <Monitor size={30} />
        <span>Client</span>
        <small>Source: high ephemeral port</small>
      </div>
      <div className="service-flow">
        <b>{protocol}</b>
        <span>{port}</span>
      </div>
      <div className="network-node server-node">
        <Server size={30} />
        <span>Server</span>
        <small>Destination: service port</small>
      </div>
      <div className="visual-detail-grid">
        <div>
          <span>Protocol</span>
          <strong><GlossaryText text={protocol} /></strong>
        </div>
        <div>
          <span>Destination</span>
          <strong>{port}</strong>
        </div>
        <div>
          <span>Transport</span>
          <strong><GlossaryText text={transport} /></strong>
        </div>
      </div>
      <p><GlossaryText text="The client sends traffic to the server IP, and the destination port tells the server which application should handle it." /></p>
    </div>
  );
}

function GenericVisual({ labels }: { labels: string[] }) {
  return (
    <div className="generic-visual">
      {labels.map((label) => (
        <b key={label}><GlossaryText text={label} /></b>
      ))}
    </div>
  );
}

export { App };
