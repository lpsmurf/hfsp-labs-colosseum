# Kimi Orchestration - Setup Instructions

The heartbeat monitoring system is installed, but needs one-time SSH setup for passwordless access to Kimi's VPS.

## One-Time Setup (Do This Once)

### Step 1: Copy Your SSH Key to Kimi's VPS

```bash
ssh-copy-id -i ~/.ssh/id_rsa root@187.124.170.113
```

When prompted, enter the root password for the VPS (187.124.170.113).

**What this does**: Adds your Mac's SSH public key to Kimi's VPS so you can connect without entering a password. The orchestration system needs this to run automatically via cron.

### Step 2: Verify Passwordless Access

```bash
ssh root@187.124.170.113 "echo 'Passwordless SSH working!'"
```

Should return: `Passwordless SSH working!` with no password prompt.

### Step 3: Start Using the Dashboard

Once Step 2 works, the hourly heartbeat will work automatically:

```bash
/Users/mac/view-kimi-status.sh
```

## What If SSH Still Doesn't Work?

### Check SSH key exists on your Mac:
```bash
ls -la ~/.ssh/id_rsa
```

Should show a file. If not, create one:
```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N ""
```

### Check Kimi's VPS is accessible:
```bash
ping -c 2 187.124.170.113
```

Should show responses. If not, VPS might be down.

### Check authorized_keys on Kimi's VPS:
```bash
ssh root@187.124.170.113 "cat ~/.ssh/authorized_keys"
```

Should show your SSH public key. If empty, try ssh-copy-id again.

### Manual SSH test with verbose output:
```bash
ssh -vvv root@187.124.170.113 "echo test"
```

Shows detailed connection info for debugging.

## After Setup

Once SSH is working:

1. **Hourly checks start automatically** - No more action needed
2. **View status anytime**: `/Users/mac/view-kimi-status.sh`
3. **Manual check**: `/Users/mac/orchestrate-kimi.sh`
4. **Check cron**: `crontab -l | grep kimi`

That's it! You're monitoring Kimi's progress in real-time.
