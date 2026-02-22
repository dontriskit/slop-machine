#!/usr/bin/env node

/**
 * Cosmic Protocol — Real-Time Agent Dashboard
 *
 * Monitors git activity across all worktrees and agent pairs.
 * Run in a separate terminal: node tools/dashboard.js
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const BASE = '/home/mhm/Documents/og-game';
const AGENT_OUTPUT_DIR = '/tmp/claude-1000/-home-mhm-Documents-og-game/tasks';
const REFRESH_MS = 2000;

// ANSI colors
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
};

function exec(cmd, cwd = BASE) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return '';
  }
}

function getWorktrees() {
  const raw = exec('git worktree list --porcelain');
  if (!raw) return [];
  const trees = [];
  let current = {};
  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) trees.push(current);
      current = { path: line.slice(9) };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice(5, 12);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice(7).replace('refs/heads/', '');
    }
  }
  if (current.path) trees.push(current);
  return trees;
}

function getRecentCommits(cwd, count = 3) {
  const raw = exec(`git log --oneline -${count} --format="%h %s" 2>/dev/null`, cwd);
  return raw ? raw.split('\n') : [];
}

function getUncommittedChanges(cwd) {
  const raw = exec('git diff --stat --no-color HEAD 2>/dev/null', cwd);
  if (!raw) return 0;
  const lines = raw.split('\n');
  const last = lines[lines.length - 1];
  const match = last.match(/(\d+) files? changed/);
  return match ? parseInt(match[1]) : 0;
}

function getBranchAhead(cwd) {
  const raw = exec(`git log master..HEAD --oneline 2>/dev/null`, cwd);
  return raw ? raw.split('\n').length : 0;
}

function getAgentOutputs() {
  if (!existsSync(AGENT_OUTPUT_DIR)) return [];
  try {
    const files = readdirSync(AGENT_OUTPUT_DIR)
      .filter(f => f.endsWith('.output'))
      .map(f => {
        const path = join(AGENT_OUTPUT_DIR, f);
        const stat = statSync(path);
        const content = readFileSync(path, 'utf-8');
        const lines = content.split('\n');
        const lastLines = lines.slice(-5).join('\n');
        const toolUses = (content.match(/Tool Use:/g) || []).length;
        const isRunning = !content.includes('Agent completed') && !content.includes('status>completed');
        return {
          id: f.replace('.output', '').slice(0, 8),
          modified: stat.mtimeMs,
          age: Date.now() - stat.mtimeMs,
          lines: lines.length,
          toolUses,
          isRunning,
          lastActivity: lastLines.slice(0, 100),
          size: stat.size,
        };
      })
      .sort((a, b) => b.modified - a.modified);
    return files;
  } catch {
    return [];
  }
}

function formatTime(ms) {
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  return `${Math.floor(ms / 3600000)}h ago`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function drawBox(title, content, width = 78) {
  const top = `${C.cyan}┌${'─'.repeat(width - 2)}┐${C.reset}`;
  const bot = `${C.cyan}└${'─'.repeat(width - 2)}┘${C.reset}`;
  const titleBar = `${C.cyan}│${C.reset} ${C.bold}${C.white}${title}${C.reset}${' '.repeat(Math.max(0, width - title.length - 4))}${C.cyan}│${C.reset}`;
  const sep = `${C.cyan}├${'─'.repeat(width - 2)}┤${C.reset}`;

  const lines = content.split('\n').map(line => {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
    const pad = Math.max(0, width - stripped.length - 4);
    return `${C.cyan}│${C.reset} ${line}${' '.repeat(pad)}${C.cyan}│${C.reset}`;
  });

  return [top, titleBar, sep, ...lines, bot].join('\n');
}

function render() {
  const now = new Date();
  const timestamp = now.toLocaleTimeString();

  // Clear screen
  process.stdout.write('\x1b[2J\x1b[H');

  // Header
  console.log(`${C.bgBlue}${C.white}${C.bold}  ⚡ COSMIC PROTOCOL — AGENT DASHBOARD                          ${timestamp}  ${C.reset}`);
  console.log();

  // Worktrees
  const trees = getWorktrees();
  let treeContent = '';
  treeContent += `${C.dim}Branch${' '.repeat(28)}HEAD     Ahead  Uncommit  Last Commit${C.reset}\n`;

  for (const tree of trees) {
    const name = tree.path.split('/').pop();
    const isMain = tree.branch === 'master' || tree.branch === 'main';
    const color = isMain ? C.green : C.yellow;
    const ahead = getBranchAhead(tree.path);
    const uncommitted = getUncommittedChanges(tree.path);
    const commits = getRecentCommits(tree.path, 1);
    const lastCommit = commits[0] || 'no commits';

    const branchDisplay = (tree.branch || 'detached').padEnd(30);
    const headDisplay = (tree.head || '').padEnd(9);
    const aheadDisplay = (ahead > 0 ? `+${ahead}` : '0').padEnd(7);
    const uncommitDisplay = (uncommitted > 0 ? `${uncommitted}` : '-').padEnd(10);

    const statusIcon = uncommitted > 0 ? `${C.red}●${C.reset}` : `${C.green}●${C.reset}`;

    treeContent += `${statusIcon} ${color}${branchDisplay}${C.reset}${C.dim}${headDisplay}${C.reset}${aheadDisplay}${uncommitDisplay}${C.dim}${lastCommit.slice(0, 40)}${C.reset}\n`;
  }

  console.log(drawBox('GIT WORKTREES', treeContent.trimEnd()));
  console.log();

  // Agent activity
  const agents = getAgentOutputs();
  if (agents.length > 0) {
    let agentContent = '';
    agentContent += `${C.dim}ID        Status     Tools  Lines   Size    Last Activity${C.reset}\n`;

    for (const agent of agents.slice(0, 12)) {
      const status = agent.isRunning
        ? `${C.green}${C.bold}RUNNING${C.reset}`
        : `${C.dim}done${C.reset}   `;
      const id = agent.id.padEnd(10);
      const tools = String(agent.toolUses).padEnd(7);
      const lines = String(agent.lines).padEnd(8);
      const size = formatSize(agent.size).padEnd(8);
      const age = formatTime(agent.age);

      agentContent += `${C.cyan}${id}${C.reset}${status}${tools}${lines}${size}${C.dim}${age}${C.reset}\n`;
    }

    console.log(drawBox(`AGENTS (${agents.length} total, ${agents.filter(a => a.isRunning).length} active)`, agentContent.trimEnd()));
    console.log();
  }

  // Recent git log (across all worktrees)
  const recentCommits = exec('git log --all --oneline --graph --decorate -15');
  if (recentCommits) {
    let commitContent = '';
    for (const line of recentCommits.split('\n').slice(0, 15)) {
      let colored = line
        .replace(/\*/g, `${C.yellow}*${C.reset}`)
        .replace(/\(([^)]+)\)/g, `${C.green}($1)${C.reset}`);
      commitContent += `${colored}\n`;
    }
    console.log(drawBox('GIT LOG (all branches)', commitContent.trimEnd()));
  }

  // Footer
  console.log();
  console.log(`${C.dim}  Refreshing every ${REFRESH_MS / 1000}s | Press Ctrl+C to exit | Worktrees: ${trees.length} | Agents: ${agents.length}${C.reset}`);
}

// Main loop
console.log('Starting Cosmic Protocol Dashboard...');
render();
setInterval(render, REFRESH_MS);

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log(`\n${C.reset}Dashboard stopped.`);
  process.exit(0);
});
