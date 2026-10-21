//! Process-tree control: pause, resume and kill a running tool together with everything it started
//! (LibreOffice, for example, runs its work in a child process).

use std::collections::HashMap;
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows_sys::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_SUSPEND_RESUME, PROCESS_TERMINATE};

#[link(name = "ntdll")]
extern "system" {
    fn NtSuspendProcess(process: HANDLE) -> i32;
    fn NtResumeProcess(process: HANDLE) -> i32;
}

/// `root` and all of its descendants.
pub fn tree(root: u32) -> Vec<u32> {
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot as isize != -1 {
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut more = Process32FirstW(snapshot, &mut entry) != 0;
            while more {
                children.entry(entry.th32ParentProcessID).or_default().push(entry.th32ProcessID);
                more = Process32NextW(snapshot, &mut entry) != 0;
            }
            CloseHandle(snapshot);
        }
    }
    let mut out = vec![root];
    let mut i = 0;
    while i < out.len() {
        if let Some(kids) = children.get(&out[i]) {
            for kid in kids {
                if !out.contains(kid) {
                    out.push(*kid);
                }
            }
        }
        i += 1;
    }
    out
}

fn with_process(pid: u32, access: u32, action: impl FnOnce(HANDLE)) {
    unsafe {
        let handle = OpenProcess(access, 0, pid);
        if !handle.is_null() {
            action(handle);
            CloseHandle(handle);
        }
    }
}

pub fn suspend_tree(root: u32) {
    for pid in tree(root) {
        with_process(pid, PROCESS_SUSPEND_RESUME, |h| unsafe {
            NtSuspendProcess(h);
        });
    }
}

pub fn resume_tree(root: u32) {
    for pid in tree(root) {
        with_process(pid, PROCESS_SUSPEND_RESUME, |h| unsafe {
            NtResumeProcess(h);
        });
    }
}

pub fn kill_tree(root: u32) {
    // Children first, so a parent cannot respawn them.
    for pid in tree(root).into_iter().rev() {
        with_process(pid, PROCESS_TERMINATE, |h| unsafe {
            TerminateProcess(h, 1);
        });
    }
}
