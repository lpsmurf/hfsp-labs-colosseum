import { exec, execSync, spawn } from 'child_process';
export function build(target: string) {
  exec(`docker build -t ${target} .`);
}
export function run(cmd: string) {
  spawn('sh', ['-c', cmd], { shell: true });
}
export function load(src: string) { return eval(src); }
