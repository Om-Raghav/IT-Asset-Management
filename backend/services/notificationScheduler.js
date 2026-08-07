/**
 * Background compliance scheduler.
 *
 * Runs automatically (no user needs to open any page) and creates
 * Notification records for:
 *   1. Assets whose warranty is expiring soon
 *   2. AMC contracts nearing their end date
 *   3. Newly detected potential duplicate assets
 *
 * Runs once shortly after server startup, then repeats on an interval
 * (default every 24h, configurable via NOTIFICATION_CHECK_INTERVAL_HOURS).
 *
 * Duplicate-notification protection: before creating a notification for
 * a given asset/contract/duplicate-group, it checks whether one was
 * already created today for that same source (via the `link` field),
 * so re-running the job repeatedly doesn't spam the same alert.
 */

const Asset = require('../models/Asset');
const AMCContract = require('../models/AMCContract');
const Notification = require('../models/Notification');

const WARRANTY_ALERT_DAYS = Number(process.env.WARRANTY_ALERT_DAYS) || 30;
const AMC_ALERT_DAYS = Number(process.env.AMC_ALERT_DAYS) || 30;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function alreadyNotifiedToday(link) {
  const existing = await Notification.findOne({ link, createdAt: { $gte: startOfToday() } });
  return !!existing;
}

// 1. Warranty expiry alerts
async function checkWarrantyExpiry() {
  const future = new Date();
  future.setDate(future.getDate() + WARRANTY_ALERT_DAYS);

  const assets = await Asset.find({ warrantyExpiry: { $lte: future, $gte: new Date() } });
  let created = 0;

  for (const asset of assets) {
    const link = `asset:${asset._id}:warranty`;
    if (await alreadyNotifiedToday(link)) continue;

    const daysLeft = Math.ceil((asset.warrantyExpiry - new Date()) / (1000 * 60 * 60 * 24));
    const riskLevel = daysLeft <= 15 ? 'High' : daysLeft <= 30 ? 'Medium' : 'Low';

    await Notification.create({
      title: 'Warranty Expiring Soon',
      message: `Asset ${asset.assetTag} - ${asset.name} has ${daysLeft} day(s) left on its warranty (${riskLevel} risk).`,
      type: riskLevel === 'High' ? 'Alert' : 'Warning',
      link
    });
    created++;
  }
  return created;
}

// 2. AMC contract expiry alerts
async function checkAMCExpiry() {
  const future = new Date();
  future.setDate(future.getDate() + AMC_ALERT_DAYS);

  const contracts = await AMCContract.find({ endDate: { $lte: future, $gte: new Date() }, status: 'Active' })
    .populate('vendor asset');
  let created = 0;

  for (const contract of contracts) {
    const link = `amc:${contract._id}:expiry`;
    if (await alreadyNotifiedToday(link)) continue;

    const daysLeft = Math.ceil((contract.endDate - new Date()) / (1000 * 60 * 60 * 24));

    await Notification.create({
      title: 'AMC Contract Expiring Soon',
      message: `Contract ${contract.contractNumber} with ${contract.vendor?.name || 'vendor'} expires in ${daysLeft} day(s).`,
      type: daysLeft <= 15 ? 'Alert' : 'Warning',
      link
    });
    created++;
  }
  return created;
}

// 3. Duplicate asset detection alerts
async function checkDuplicateAssets() {
  const assets = await Asset.find();
  const groups = {};

  assets.forEach(a => {
    if (a.serialNumber) {
      const key = `serial:${a.serialNumber.trim().toLowerCase()}`;
      groups[key] = groups[key] || [];
      groups[key].push(a);
    }
    const nameKey = `combo:${(a.name || '').toLowerCase()}|${(a.brand || '').toLowerCase()}|${(a.model || '').toLowerCase()}`;
    groups[nameKey] = groups[nameKey] || [];
    groups[nameKey].push(a);
  });

  let created = 0;
  for (const [key, list] of Object.entries(groups)) {
    if (list.length < 2) continue;
    const link = `duplicate:${key}`;
    if (await alreadyNotifiedToday(link)) continue;

    const tags = list.map(a => a.assetTag).join(', ');
    await Notification.create({
      title: 'Possible Duplicate Assets Detected',
      message: `${list.length} assets appear to be duplicates (matched on ${key.split(':')[0]}): ${tags}.`,
      type: 'Warning',
      link
    });
    created++;
  }
  return created;
}

async function runComplianceChecks() {
  try {
    const [warranty, amc, duplicates] = await Promise.all([
      checkWarrantyExpiry(),
      checkAMCExpiry(),
      checkDuplicateAssets()
    ]);
    const total = warranty + amc + duplicates;
    if (total > 0) {
      console.log(`[Scheduler] Created ${total} notification(s) - warranty:${warranty} amc:${amc} duplicates:${duplicates}`);
    } else {
      console.log('[Scheduler] Compliance check ran - no new alerts.');
    }
    return { warranty, amc, duplicates, total };
  } catch (err) {
    console.error('[Scheduler] Compliance check failed:', err.message);
  }
}

let intervalHandle = null;

function start() {
  const hours = Number(process.env.NOTIFICATION_CHECK_INTERVAL_HOURS) || 24;
  const intervalMs = hours * 60 * 60 * 1000;

  // Run once shortly after startup (small delay so the DB connection settles)
  setTimeout(runComplianceChecks, 5000);

  // Then repeat automatically forever - no page visit or manual trigger needed
  intervalHandle = setInterval(runComplianceChecks, intervalMs);
  console.log(`[Scheduler] Automatic compliance checks scheduled every ${hours}h.`);
}

function stop() {
  if (intervalHandle) clearInterval(intervalHandle);
}

module.exports = { start, stop, runComplianceChecks };
