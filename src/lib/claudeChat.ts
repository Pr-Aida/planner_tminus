export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeChatResponse {
  content: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number } | null;
  stop_reason: string | null;
}

const GREETING_KEYWORDS = ['hello', 'hi', 'hey', 'greetings', 'howdy', 'yo '];
const PLAN_KEYWORDS = ['plan', 'schedule', 'daily plan', 'study plan', 'routine', 'organize my day', 'plan my day'];
const TIP_KEYWORDS = ['tip', 'advice', 'how do i', 'how should', 'better', 'improve', 'focus', 'motivated', 'procrastinat'];
const BREAK_KEYWORDS = ['break', 'rest', 'tired', 'burnout', 'overwhelmed', 'exhausted'];
const EXAM_KEYWORDS = ['exam', 'test', 'quiz', 'midterm', 'final', 'revision', 'review'];
const THANKS_KEYWORDS = ['thank', 'thanks', 'appreciate', 'grateful'];

function lower(text: string): string {
  return text.toLowerCase();
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some(k => text.includes(k));
}

function generateDailyPlan(input: string): string {
  const wakeMatch = input.match(/(\d{1,2})\s*(?:am|pm)?\s*(?:wake|start|begin|up|morning)/i);
  const wakeHour = wakeMatch ? parseInt(wakeMatch[1], 10) : 7;
  const startHour = wakeHour > 12 ? wakeHour - 12 : wakeHour;

  const subjectsMatch = input.match(/(?:study|subjects?|topics?|focus)\s*(?:on|:)?\s*([a-z0-9,\s]+)/i);
  const subjects = subjectsMatch
    ? subjectsMatch[1].split(/[,/]| and /i).map(s => s.trim()).filter(Boolean).slice(0, 4)
    : ['your main subject'];

  const slots: string[] = [];
  const blocks = [
    { label: 'Morning Routine', duration: 1, type: 'routine' },
    { label: `${subjects[0] || 'Deep Study'}`, duration: 2, type: 'study' },
    { label: 'Short Break', duration: 0.5, type: 'break' },
    { label: `${subjects[1] || 'Practice Problems'}`, duration: 1.5, type: 'study' },
    { label: 'Lunch & Rest', duration: 1, type: 'break' },
    { label: `${subjects[2] || 'Review & Notes'}`, duration: 1.5, type: 'study' },
    { label: 'Short Break', duration: 0.5, type: 'break' },
    { label: `${subjects[3] || 'Light Reading'}`, duration: 1, type: 'study' },
    { label: 'Exercise / Walk', duration: 0.5, type: 'routine' },
    { label: 'Wind Down & Plan Tomorrow', duration: 0.5, type: 'routine' },
  ];

  let currentHour = startHour;
  let ampm = wakeMatch && /pm/i.test(wakeMatch[0]) ? 'PM' : 'AM';
  if (wakeHour >= 12) ampm = 'PM';

  for (const block of blocks) {
    const startH = currentHour;
    const startLabel = formatHour(startH, ampm);
    const endH = startH + block.duration;
    const { hour: nextHour, ampm: nextAmpm } = wrapHour(endH, ampm);
    const endLabel = formatHour(nextHour, nextAmpm);
    const icon = block.type === 'study' ? '[Study]' : block.type === 'break' ? '[Break]' : '[Routine]';
    slots.push(`${startLabel} – ${endLabel}  ${icon} ${block.label}`);
    currentHour = nextHour;
    ampm = nextAmpm;
  }

  return [
    "Here's a suggested daily plan based on your input:",
    '',
    ...slots,
    '',
    'Tips for this schedule:',
    '- Tackle the hardest subject first when your energy is highest.',
    '- Keep breaks screen-free to let your eyes and mind rest.',
    '- Adjust block lengths to match your attention span — 90 minutes is a sweet spot for most people.',
  ].join('\n');
}

function formatHour(hour: number, ampm: string): string {
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:00 ${ampm}`;
}

function wrapHour(hour: number, ampm: string): { hour: number; ampm: string } {
  if (hour >= 12) {
    if (ampm === 'AM') ampm = 'PM';
    else ampm = 'AM';
    hour = hour > 12 ? hour - 12 : hour;
  }
  return { hour, ampm };
}

function generateTips(input: string): string {
  const tips: string[] = [];

  if (hasAny(input, ['focus', 'concentrate', 'distract'])) {
    tips.push(
      '- Try the Pomodoro technique: 25 minutes of focused work, then a 5-minute break.',
      '- Put your phone in another room or use an app blocker during study sessions.',
      '- Set one clear goal per session so you know exactly when you\'re done.',
    );
  }
  if (hasAny(input, ['motivat', 'procrastinat', 'lazy', 'stuck'])) {
    tips.push(
      '- Start with a 2-minute task — momentum beats motivation.',
      '- Break big tasks into small steps and check them off as you go.',
      '- Reward yourself after each completed block, not just at the end of the day.',
    );
  }
  if (hasAny(input, ['remember', 'memori', 'retain', 'forget'])) {
    tips.push(
      '- Use active recall: close your notes and write what you remember, then check.',
      '- Space out your review sessions over days instead of cramming in one night.',
    );
  }
  if (hasAny(input, ['exam', 'test', 'midterm', 'final'])) {
    tips.push(
      '- Do practice questions under timed conditions to simulate the real thing.',
      '- Identify your weak areas early and spend extra time there.',
      '- Review your mistakes — understanding why you got it wrong matters more than the score.',
    );
  }
  if (hasAny(input, ['sleep', 'tired', 'rest', 'energy'])) {
    tips.push(
      '- Aim for 7-8 hours of sleep — your brain consolidates memory overnight.',
      '- Avoid screens 30 minutes before bed to fall asleep faster.',
    );
  }

  if (tips.length === 0) {
    tips.push(
      '- Plan your day the night before so you start with direction, not decisions.',
      '- Use time blocks: assign a specific task to each block and protect that time.',
      '- Review your week every Sunday — note what worked and adjust what didn\'t.',
      '- Don\'t forget to schedule breaks and downtime. Rest is part of productivity.',
    );
  }

  return ['Here are some tips that might help:', '', ...tips].join('\n');
}

function generateBreakAdvice(): string {
  return [
    'It sounds like you need a reset. Here\'s a quick plan:',
    '',
    '1. Step away from your desk for at least 10 minutes.',
    '2. Drink water and have a light snack.',
    '3. Take a short walk or do some light stretching.',
    '4. When you return, pick one small task to ease back in.',
    '',
    'Remember: breaks aren\'t wasted time — they\'re when your brain consolidates what you learned.',
  ].join('\n');
}

function generateGreeting(): string {
  const greetings = [
    "Hi there! I'm your study-planning assistant. I can help you build a daily plan, share study tips, or suggest ways to stay focused. What do you need today?",
    "Hello! Ready to plan your day? Tell me what you're studying or what time you start, and I'll draft a schedule for you.",
    "Hey! I'm here to help you plan and stay on track. Ask me for a daily plan, study tips, or advice on managing your time.",
  ];
  return greetings[Math.floor(Math.random() * greetings.length)];
}

function generateThanks(): string {
  return "You're welcome! Feel free to ask if you need another plan or any study advice. You've got this!";
}

function generateFallback(input: string): string {
  if (input.length < 10) {
    return "I'm not sure I caught that. Could you tell me a bit more? For example, you can ask me to 'plan my day starting at 8am studying math and physics' or 'give me tips for focusing'.";
  }
  return [
    "Here's what I can help with:",
    '',
    '- "Plan my day" — I\'ll generate a hour-by-hour study schedule.',
    '- "Give me tips for focusing" — practical advice to improve concentration.',
    "- \"I'm feeling overwhelmed\" — suggestions for breaks and resets.",
    '- "Help me prepare for my exam" — exam-specific study strategies.',
    '',
    'Try asking me any of these, or describe your situation and I\'ll do my best to help.',
  ].join('\n');
}

function generateResponse(messages: ChatMessage[]): string {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) return generateGreeting();

  const text = lower(lastUserMsg.content);

  if (hasAny(text, GREETING_KEYWORDS) && text.length < 20) return generateGreeting();
  if (hasAny(text, THANKS_KEYWORDS)) return generateThanks();
  if (hasAny(text, PLAN_KEYWORDS)) return generateDailyPlan(lastUserMsg.content);
  if (hasAny(text, BREAK_KEYWORDS)) return generateBreakAdvice();
  if (hasAny(text, EXAM_KEYWORDS) && !hasAny(text, PLAN_KEYWORDS)) return generateTips(lastUserMsg.content);
  if (hasAny(text, TIP_KEYWORDS)) return generateTips(lastUserMsg.content);

  return generateFallback(lastUserMsg.content);
}

export async function sendClaudeChat(
  messages: ChatMessage[],
  _options?: { system?: string; maxTokens?: number },
): Promise<ClaudeChatResponse> {
  await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 500));

  const content = generateResponse(messages);

  return {
    content,
    model: 'mock-planner-v1',
    usage: { input_tokens: messages.length, output_tokens: Math.ceil(content.length / 4) },
    stop_reason: 'end_turn',
  };
}
