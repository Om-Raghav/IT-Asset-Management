/**
 * Read-only database "tools" the chat assistant's LLM can call on demand
 * (via Groq's OpenAI-compatible function calling) to answer questions
 * that need real data - instead of guessing, or being limited to a fixed
 * set of pre-computed stats.
 *
 * Every tool here is intentionally scoped and read-only: no tool can
 * create, update, or delete anything, and none expose User accounts,
 * passwords, or auth data - only the operational asset-management data
 * that's already visible elsewhere in the app.
 *
 * NOTE ON SCOPE: this project's schema has no Ticket, PurchaseOrder, or
 * AssetHistory/transfer-log collections - only AuditLog, Repair, and
 * AMCContract. Tools here cover every collection that actually exists;
 * ticket/purchase-order/asset-history style questions are intentionally
 * out of scope until those collections exist.
 */

const Asset = require('../models/Asset');
const AssetCategory = require('../models/AssetCategory');
const Vendor = require('../models/Vendor');
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Location = require('../models/Location');
const AssetAssignment = require('../models/AssetAssignment');
const AssetReturn = require('../models/AssetReturn');
const Repair = require('../models/Repair');
const AMCContract = require('../models/AMCContract');
const SoftwareLicense = require('../models/SoftwareLicense');

const clamp = (n, def, max) => Math.min(Math.max(Number(n) || def, 1), max);
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + Number(n || 0)); return d; };

// Resolve a free-text name (category/vendor/location/department) to its ObjectId, case-insensitive.
async function resolveIdByName(Model, name) {
  if (!name) return undefined;
  const doc = await Model.findOne({ name: { $regex: `^${name}`, $options: 'i' } });
  return doc?._id;
}

// Resolve a department name to the set of asset IDs currently assigned to
// employees in that department (assets have no direct department field -
// department is reached via the active assignment -> employee -> department chain).
async function getAssetIdsForDepartment(departmentName) {
  const dept = await Department.findOne({ name: { $regex: `^${departmentName}`, $options: 'i' } });
  if (!dept) return { deptFound: false, assetIds: [] };
  const employeeIds = await Employee.find({ department: dept._id }).distinct('_id');
  const assetIds = await AssetAssignment.find({ employee: { $in: employeeIds }, status: 'Active' }).distinct('asset');
  return { deptFound: true, deptName: dept.name, assetIds };
}

const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'search_assets',
      description: 'Search/filter IT assets by status, category, vendor, location, department, purchase date range, cost range, age, or free-text (tag/name/brand/model/serial). Use this for most asset-search and purchase questions, including "most expensive assets" (sortBy costHighToLow + limit) and "assets older than N years" (olderThanYears).',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['Available', 'Assigned', 'In Repair', 'Retired', 'Scrapped'] },
          category: { type: 'string', description: 'Category name, e.g. Laptop, Desktop, Printer, Server, Monitor, Software' },
          vendor: { type: 'string', description: 'Vendor name, e.g. Dell Technologies' },
          location: { type: 'string', description: 'Location/office name, e.g. Delhi' },
          department: { type: 'string', description: 'Department name - filters to assets currently assigned to employees in this department, e.g. Finance' },
          search: { type: 'string', description: 'Free-text search across tag, name, brand, model, serial number' },
          purchasedAfter: { type: 'string', description: 'ISO date or year (e.g. "2023" or "2023-01-01") - assets purchased on/after this date' },
          purchasedBefore: { type: 'string', description: 'ISO date or year - assets purchased on/before this date' },
          minCost: { type: 'number', description: 'Minimum purchase cost' },
          maxCost: { type: 'number', description: 'Maximum purchase cost' },
          olderThanYears: { type: 'number', description: 'Only assets purchased more than this many years ago' },
          warrantyStatus: { type: 'string', enum: ['active', 'expired'], description: '"active" = still under warranty, "expired" = warranty has passed' },
          sortBy: { type: 'string', enum: ['newest', 'oldest', 'costHighToLow', 'costLowToHigh'], description: 'Default is newest first' },
          limit: { type: 'number', description: 'Max results to return, default 20, max 50' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_asset_by_tag',
      description: 'Get full details for one specific asset by its exact asset tag, including who it is currently assigned to, its repair count, and software licenses installed on it.',
      parameters: {
        type: 'object',
        properties: { assetTag: { type: 'string' } },
        required: ['assetTag']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'count_assets_by_field',
      description: 'Get asset counts grouped by a field - use for "X-wise asset count" / breakdown / "which X has the most assets" questions (status, category, vendor, condition, location, or department).',
      parameters: {
        type: 'object',
        properties: {
          groupBy: { type: 'string', enum: ['status', 'category', 'vendor', 'condition', 'location', 'department'] }
        },
        required: ['groupBy']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_employees',
      description: 'Search employees by name/code/email/designation, optionally filtered by department or status.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          department: { type: 'string', description: 'Department name' },
          status: { type: 'string', enum: ['Active', 'Inactive'] },
          limit: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_employee_assets',
      description: 'Find assets currently assigned to a specific employee, AND assets they previously returned (return history), by their name or employee code. Use this for any question about what an employee has, had, or returned, or "who is using [asset]".',
      parameters: {
        type: 'object',
        properties: { employeeSearch: { type: 'string', description: 'Employee name or employee code' } },
        required: ['employeeSearch']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_employee_asset_stats',
      description: 'Find employees with unusual asset counts: those holding multiple assets at once, or those with none of a given category (e.g. "employees without laptops").',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['multiple_assets', 'without_category'], description: '"multiple_assets" = employees currently assigned more than one asset; "without_category" = active employees with zero assets of the given category' },
          category: { type: 'string', description: 'Required when mode is "without_category", e.g. Laptop' },
          limit: { type: 'number' }
        },
        required: ['mode']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_returns',
      description: 'Search asset return records org-wide (not tied to one employee) - which assets were returned, by whom, when, and in what condition.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Free-text match on asset tag/name or employee name' },
          condition: { type: 'string', enum: ['New', 'Good', 'Fair', 'Poor', 'Damaged'] },
          limit: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_repairs',
      description: 'Search repair/service records by status and/or free-text on the issue description. Use for "open/pending repairs" or "assets under maintenance" style questions.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'] },
          search: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_maintenance_history',
      description: 'Get the full repair/maintenance history (every logged repair, not just a count) for one specific asset by its asset tag.',
      parameters: {
        type: 'object',
        properties: { assetTag: { type: 'string' } },
        required: ['assetTag']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_frequently_repaired_assets',
      description: 'List the assets with the most repair records, ranked highest-first. Use for "frequently repaired assets" or "which assets break down the most".',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'Default 10, max 30' } }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_amc_contracts',
      description: 'Search AMC (annual maintenance contract) records by status, free-text, or contracts ending soon.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['Active', 'Expired', 'Cancelled'] },
          search: { type: 'string' },
          endingWithinDays: { type: 'number', description: 'Only contracts ending within this many days from today - use for "maintenance due this week" (7) style questions' },
          limit: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_software_licenses',
      description: 'Search software licenses by name - returns seat usage (used/total/available), expiry, AND which assets/employees each license is assigned to.',
      parameters: {
        type: 'object',
        properties: { search: { type: 'string' }, limit: { type: 'number' } }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_license_overview',
      description: 'Get software licenses filtered by a computed status: seats still available, expired, expiring soon, or completely unused. Use this instead of search_software_licenses for these specific questions.',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', enum: ['available_seats', 'expired', 'expiring_within_days', 'unused'], description: '"available_seats" = has at least one free seat, "unused" = zero seats assigned' },
          days: { type: 'number', description: 'Required when filter is "expiring_within_days", e.g. 30' },
          limit: { type: 'number' }
        },
        required: ['filter']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_vendors',
      description: 'Search vendors by name/email/contact person.',
      parameters: {
        type: 'object',
        properties: { search: { type: 'string' }, limit: { type: 'number' } }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_dashboard_summary',
      description: 'Get overall organization-wide stats: total/available/assigned/in-repair/retired asset counts, active employees, pending repairs, newly added assets (last 7 days), and items expiring soon (warranty/AMC/licenses). Use for broad "how are we doing" or "total assets today" style questions.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_warranty_overview',
      description: 'Get assets filtered by a warranty-related condition. Use this for all warranty questions instead of search_assets.',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', enum: ['expiring_this_month', 'expired', 'expiring_within_days', 'still_under_warranty'] },
          days: { type: 'number', description: 'Required when filter is "expiring_within_days"' },
          limit: { type: 'number' }
        },
        required: ['filter']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_analytics',
      description: 'Answer higher-level analytical questions that need cross-collection computation: which department/vendor leads in some way, average asset age, or which assets should be replaced soon (health-score based).',
      parameters: {
        type: 'object',
        properties: {
          metric: {
            type: 'string',
            enum: ['department_with_most_assets', 'vendor_supplied_most_of_category', 'average_asset_age', 'assets_to_replace_soon']
          },
          category: { type: 'string', description: 'Required when metric is "vendor_supplied_most_of_category", e.g. Laptop' },
          limit: { type: 'number', description: 'Used by "assets_to_replace_soon", default 10' }
        },
        required: ['metric']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_report_summary',
      description: 'Get a summarized report (aggregated, not a full raw dump) for a given report type - use when the user asks to "generate" or "show" a report.',
      parameters: {
        type: 'object',
        properties: {
          reportType: { type: 'string', enum: ['inventory', 'warranty', 'vendor', 'department', 'maintenance'] }
        },
        required: ['reportType']
      }
    }
  }
];

const executors = {
  async search_assets(args) {
    const query = {};
    if (args.status) query.status = args.status;
    if (args.category) { const id = await resolveIdByName(AssetCategory, args.category); if (id) query.category = id; }
    if (args.vendor) { const id = await resolveIdByName(Vendor, args.vendor); if (id) query.vendor = id; }
    if (args.location) { const id = await resolveIdByName(Location, args.location); if (id) query.location = id; }
    if (args.search) {
      query.$or = ['name', 'assetTag', 'serialNumber', 'brand', 'model'].map(f => ({ [f]: { $regex: args.search, $options: 'i' } }));
    }

    if (args.purchasedAfter || args.purchasedBefore) {
      query.purchaseDate = {};
      if (args.purchasedAfter) {
        const s = /^\d{4}$/.test(String(args.purchasedAfter)) ? `${args.purchasedAfter}-01-01` : args.purchasedAfter;
        query.purchaseDate.$gte = new Date(s);
      }
      if (args.purchasedBefore) {
        const s = /^\d{4}$/.test(String(args.purchasedBefore)) ? `${args.purchasedBefore}-12-31` : args.purchasedBefore;
        query.purchaseDate.$lte = new Date(s);
      }
    }

    if (args.olderThanYears) {
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - Number(args.olderThanYears));
      query.purchaseDate = { ...(query.purchaseDate || {}), $lte: cutoff };
    }

    if (args.minCost != null || args.maxCost != null) {
      query.purchaseCost = {};
      if (args.minCost != null) query.purchaseCost.$gte = Number(args.minCost);
      if (args.maxCost != null) query.purchaseCost.$lte = Number(args.maxCost);
    }

    if (args.warrantyStatus === 'active') query.warrantyExpiry = { $gte: new Date() };
    if (args.warrantyStatus === 'expired') query.warrantyExpiry = { $lt: new Date() };

    if (args.department) {
      const { deptFound, deptName, assetIds } = await getAssetIdsForDepartment(args.department);
      if (!deptFound) return { count: 0, assets: [], message: `No department found matching "${args.department}"` };
      query._id = { $in: assetIds };
      args._resolvedDept = deptName;
    }

    const sortMap = {
      newest: { purchaseDate: -1 }, oldest: { purchaseDate: 1 },
      costHighToLow: { purchaseCost: -1 }, costLowToHigh: { purchaseCost: 1 }
    };
    const sort = sortMap[args.sortBy] || sortMap.newest;

    const limit = clamp(args.limit, 20, 50);
    const assets = await Asset.find(query).populate('category vendor location').sort(sort).limit(limit);
    return {
      count: assets.length,
      ...(args._resolvedDept ? { department: args._resolvedDept } : {}),
      assets: assets.map(a => ({
        assetTag: a.assetTag, name: a.name, category: a.category?.name, vendor: a.vendor?.name,
        location: a.location?.name, status: a.status, condition: a.condition,
        purchaseDate: a.purchaseDate, purchaseCost: a.purchaseCost, warrantyExpiry: a.warrantyExpiry
      }))
    };
  },

  async get_asset_by_tag(args) {
    const asset = await Asset.findOne({ assetTag: { $regex: `^${args.assetTag}$`, $options: 'i' } }).populate('category vendor location');
    if (!asset) return { found: false, message: `No asset found with tag "${args.assetTag}"` };

    const [assignment, repairCount, licenses] = await Promise.all([
      AssetAssignment.findOne({ asset: asset._id, status: 'Active' }).populate('employee'),
      Repair.countDocuments({ asset: asset._id }),
      SoftwareLicense.find({ assignedAssets: asset._id }).select('name')
    ]);

    return {
      found: true,
      assetTag: asset.assetTag, name: asset.name, category: asset.category?.name, vendor: asset.vendor?.name,
      brand: asset.brand, model: asset.model, serialNumber: asset.serialNumber, status: asset.status,
      condition: asset.condition, location: asset.location?.name, purchaseDate: asset.purchaseDate,
      purchaseCost: asset.purchaseCost, warrantyExpiry: asset.warrantyExpiry,
      assignedTo: assignment?.employee?.name || null,
      totalRepairsLogged: repairCount,
      softwareLicensesInstalled: licenses.map(l => l.name)
    };
  },

  async count_assets_by_field(args) {
    if (args.groupBy === 'department') {
      const departments = await Department.find();
      const breakdown = await Promise.all(departments.map(async d => {
        const employeeIds = await Employee.find({ department: d._id }).distinct('_id');
        const count = await AssetAssignment.countDocuments({ employee: { $in: employeeIds }, status: 'Active' });
        return { department: d.name, count };
      }));
      return { groupBy: 'department', breakdown: breakdown.sort((a, b) => b.count - a.count) };
    }

    const fieldMap = { status: '$status', condition: '$condition', category: '$category', vendor: '$vendor', location: '$location' };
    const groupField = fieldMap[args.groupBy] || '$status';
    const results = await Asset.aggregate([{ $group: { _id: groupField, count: { $sum: 1 } } }]);

    if (['category', 'vendor', 'location'].includes(args.groupBy)) {
      const Model = args.groupBy === 'category' ? AssetCategory : args.groupBy === 'vendor' ? Vendor : Location;
      const resolved = await Promise.all(results.map(async r => {
        const doc = r._id ? await Model.findById(r._id).select('name') : null;
        return { [args.groupBy]: doc?.name || 'Unassigned', count: r.count };
      }));
      return { groupBy: args.groupBy, breakdown: resolved.sort((a, b) => b.count - a.count) };
    }
    return { groupBy: args.groupBy, breakdown: results.map(r => ({ [args.groupBy]: r._id, count: r.count })) };
  },

  async search_employees(args) {
    const query = {};
    if (args.status) query.status = args.status;
    if (args.department) { const id = await resolveIdByName(Department, args.department); if (id) query.department = id; }
    if (args.search) {
      query.$or = ['name', 'employeeCode', 'email', 'designation'].map(f => ({ [f]: { $regex: args.search, $options: 'i' } }));
    }
    const limit = clamp(args.limit, 20, 50);
    const employees = await Employee.find(query).populate('department location').limit(limit);
    return {
      count: employees.length,
      employees: employees.map(e => ({
        employeeCode: e.employeeCode, name: e.name, department: e.department?.name,
        designation: e.designation, status: e.status
      }))
    };
  },

  async get_employee_assets(args) {
    const employee = await Employee.findOne({
      $or: [{ name: { $regex: args.employeeSearch, $options: 'i' } }, { employeeCode: { $regex: args.employeeSearch, $options: 'i' } }]
    });
    if (!employee) return { found: false, message: `No employee found matching "${args.employeeSearch}"` };

    const [assignments, returns] = await Promise.all([
      AssetAssignment.find({ employee: employee._id, status: 'Active' }).populate('asset'),
      AssetReturn.find({ employee: employee._id }).populate('asset').sort({ returnDate: -1 })
    ]);

    return {
      found: true,
      employee: employee.name,
      employeeCode: employee.employeeCode,
      currentlyAssignedAssets: assignments.map(a => ({ assetTag: a.asset?.assetTag, name: a.asset?.name, assignedDate: a.assignedDate })),
      previouslyReturnedAssets: returns.map(r => ({
        assetTag: r.asset?.assetTag, name: r.asset?.name, returnDate: r.returnDate,
        condition: r.condition, remarks: r.remarks
      }))
    };
  },

  async get_employee_asset_stats(args) {
    const limit = clamp(args.limit, 20, 50);

    if (args.mode === 'multiple_assets') {
      const grouped = await AssetAssignment.aggregate([
        { $match: { status: 'Active' } },
        { $group: { _id: '$employee', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit }
      ]);
      const employees = await Employee.find({ _id: { $in: grouped.map(g => g._id) } }).populate('department');
      const empMap = new Map(employees.map(e => [String(e._id), e]));
      return {
        count: grouped.length,
        employees: grouped.map(g => ({
          employee: empMap.get(String(g._id))?.name || 'Unknown',
          department: empMap.get(String(g._id))?.department?.name,
          assetCount: g.count
        }))
      };
    }

    if (args.mode === 'without_category') {
      if (!args.category) return { error: 'category is required for mode "without_category"' };
      const categoryId = await resolveIdByName(AssetCategory, args.category);
      if (!categoryId) return { count: 0, employees: [], message: `No category found matching "${args.category}"` };

      const assetIdsInCategory = await Asset.find({ category: categoryId }).distinct('_id');
      const employeeIdsWithCategory = await AssetAssignment.find({ asset: { $in: assetIdsInCategory }, status: 'Active' }).distinct('employee');
      const employees = await Employee.find({ status: 'Active', _id: { $nin: employeeIdsWithCategory } }).populate('department').limit(limit);

      return {
        category: args.category,
        count: employees.length,
        employees: employees.map(e => ({ employee: e.name, employeeCode: e.employeeCode, department: e.department?.name }))
      };
    }

    return { error: `Unknown mode "${args.mode}"` };
  },

  async search_returns(args) {
    const query = {};
    if (args.condition) query.condition = args.condition;
    const limit = clamp(args.limit, 20, 50);
    let returns = await AssetReturn.find(query).populate('asset employee').sort({ returnDate: -1 }).limit(limit);

    if (args.search) {
      const s = args.search.toLowerCase();
      returns = returns.filter(r =>
        r.asset?.assetTag?.toLowerCase().includes(s) ||
        r.asset?.name?.toLowerCase().includes(s) ||
        r.employee?.name?.toLowerCase().includes(s)
      );
    }

    return {
      count: returns.length,
      returns: returns.map(r => ({
        assetTag: r.asset?.assetTag, assetName: r.asset?.name, employee: r.employee?.name,
        returnDate: r.returnDate, condition: r.condition, remarks: r.remarks
      }))
    };
  },

  async search_repairs(args) {
    const query = {};
    if (args.status) query.status = args.status;
    if (args.search) query.issueDescription = { $regex: args.search, $options: 'i' };
    const limit = clamp(args.limit, 20, 50);
    const repairs = await Repair.find(query).populate('asset vendor').sort({ reportedDate: -1 }).limit(limit);
    return {
      count: repairs.length,
      repairs: repairs.map(r => ({
        assetTag: r.asset?.assetTag, assetName: r.asset?.name, issue: r.issueDescription,
        status: r.status, vendor: r.vendor?.name, reportedDate: r.reportedDate, cost: r.cost
      }))
    };
  },

  async get_maintenance_history(args) {
    const asset = await Asset.findOne({ assetTag: { $regex: `^${args.assetTag}$`, $options: 'i' } });
    if (!asset) return { found: false, message: `No asset found with tag "${args.assetTag}"` };
    const repairs = await Repair.find({ asset: asset._id }).populate('vendor reportedByEmployee').sort({ reportedDate: -1 });
    return {
      found: true,
      assetTag: asset.assetTag,
      assetName: asset.name,
      totalRepairs: repairs.length,
      repairs: repairs.map(r => ({
        issue: r.issueDescription, status: r.status, vendor: r.vendor?.name,
        reportedBy: r.reportedByEmployee?.name, reportedDate: r.reportedDate,
        completedDate: r.completedDate, cost: r.cost, remarks: r.remarks
      }))
    };
  },

  async get_frequently_repaired_assets(args) {
    const limit = clamp(args.limit, 10, 30);
    const grouped = await Repair.aggregate([
      { $group: { _id: '$asset', repairCount: { $sum: 1 }, totalCost: { $sum: '$cost' } } },
      { $sort: { repairCount: -1 } },
      { $limit: limit }
    ]);
    const assets = await Asset.find({ _id: { $in: grouped.map(g => g._id) } }).populate('category vendor');
    const assetMap = new Map(assets.map(a => [String(a._id), a]));
    return {
      count: grouped.length,
      assets: grouped.map(g => {
        const a = assetMap.get(String(g._id));
        return { assetTag: a?.assetTag, name: a?.name, category: a?.category?.name, repairCount: g.repairCount, totalRepairCost: g.totalCost };
      })
    };
  },

  async search_amc_contracts(args) {
    const query = {};
    if (args.status) query.status = args.status;
    if (args.search) query.$or = [{ contractNumber: { $regex: args.search, $options: 'i' } }, { coverageDetails: { $regex: args.search, $options: 'i' } }];
    if (args.endingWithinDays != null) query.endDate = { $gte: new Date(), $lte: daysFromNow(args.endingWithinDays) };
    const limit = clamp(args.limit, 20, 50);
    const contracts = await AMCContract.find(query).populate('asset vendor').sort({ endDate: 1 }).limit(limit);
    return {
      count: contracts.length,
      contracts: contracts.map(c => ({
        contractNumber: c.contractNumber, vendor: c.vendor?.name, asset: c.asset?.assetTag,
        startDate: c.startDate, endDate: c.endDate, cost: c.cost, status: c.status
      }))
    };
  },

  async search_software_licenses(args) {
    const query = {};
    if (args.search) query.name = { $regex: args.search, $options: 'i' };
    const limit = clamp(args.limit, 20, 50);
    const licenses = await SoftwareLicense.find(query).populate('vendor assignedTo assignedAssets').limit(limit);
    return {
      count: licenses.length,
      licenses: licenses.map(l => ({
        name: l.name, vendor: l.vendor?.name, seatsTotal: l.seatsTotal,
        seatsUsed: (l.assignedTo?.length || 0) + (l.assignedAssets?.length || 0),
        expiryDate: l.expiryDate, status: l.status,
        assignedToAssets: (l.assignedAssets || []).map(a => `${a.assetTag} - ${a.name}`),
        assignedToEmployees: (l.assignedTo || []).map(e => e.name)
      }))
    };
  },

  async get_license_overview(args) {
    const limit = clamp(args.limit, 20, 50);
    const all = await SoftwareLicense.find().populate('vendor assignedTo assignedAssets');
    const withUsage = all.map(l => ({
      doc: l, seatsUsed: (l.assignedTo?.length || 0) + (l.assignedAssets?.length || 0)
    }));

    let filtered;
    if (args.filter === 'available_seats') {
      filtered = withUsage.filter(x => x.seatsUsed < x.doc.seatsTotal && x.doc.status === 'Active');
    } else if (args.filter === 'expired') {
      filtered = withUsage.filter(x => x.doc.status === 'Expired' || (x.doc.expiryDate && x.doc.expiryDate < new Date()));
    } else if (args.filter === 'expiring_within_days') {
      const days = args.days || 30;
      const cutoff = daysFromNow(days);
      filtered = withUsage.filter(x => x.doc.expiryDate && x.doc.expiryDate >= new Date() && x.doc.expiryDate <= cutoff);
    } else if (args.filter === 'unused') {
      filtered = withUsage.filter(x => x.seatsUsed === 0);
    } else {
      return { error: `Unknown filter "${args.filter}"` };
    }

    filtered = filtered.slice(0, limit);
    return {
      filter: args.filter,
      count: filtered.length,
      licenses: filtered.map(x => ({
        name: x.doc.name, vendor: x.doc.vendor?.name, seatsTotal: x.doc.seatsTotal,
        seatsUsed: x.seatsUsed, seatsAvailable: x.doc.seatsTotal - x.seatsUsed,
        expiryDate: x.doc.expiryDate, status: x.doc.status
      }))
    };
  },

  async search_vendors(args) {
    const query = {};
    if (args.search) query.$or = ['name', 'email', 'contactPerson'].map(f => ({ [f]: { $regex: args.search, $options: 'i' } }));
    const limit = clamp(args.limit, 20, 50);
    const vendors = await Vendor.find(query).limit(limit);
    return {
      count: vendors.length,
      vendors: vendors.map(v => ({ name: v.name, email: v.email, contactPerson: v.contactPerson, phone: v.phone, status: v.status }))
    };
  },

  async get_dashboard_summary() {
    const thirtyDays = daysFromNow(30);
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const [total, available, assigned, inRepair, retired, activeEmployees, pendingRepairs, warrantyExpiring, licensesExpiring, amcExpiring, newlyAdded] = await Promise.all([
      Asset.countDocuments(),
      Asset.countDocuments({ status: 'Available' }),
      Asset.countDocuments({ status: 'Assigned' }),
      Asset.countDocuments({ status: 'In Repair' }),
      Asset.countDocuments({ status: { $in: ['Retired', 'Scrapped'] } }),
      Employee.countDocuments({ status: 'Active' }),
      Repair.countDocuments({ status: { $in: ['Pending', 'In Progress'] } }),
      Asset.countDocuments({ warrantyExpiry: { $lte: thirtyDays, $gte: new Date() } }),
      SoftwareLicense.countDocuments({ expiryDate: { $lte: thirtyDays, $gte: new Date() } }),
      AMCContract.countDocuments({ endDate: { $lte: thirtyDays, $gte: new Date() } }),
      Asset.countDocuments({ createdAt: { $gte: sevenDaysAgo } })
    ]);
    return {
      total, available, assigned, inRepair, retired, activeEmployees, pendingRepairs,
      warrantyExpiringSoon: warrantyExpiring, licensesExpiringSoon: licensesExpiring,
      amcExpiringSoon: amcExpiring, newlyAddedLast7Days: newlyAdded
    };
  },

  async get_warranty_overview(args) {
    const limit = clamp(args.limit, 20, 50);
    const query = {};
    if (args.filter === 'expiring_this_month') {
      const now = new Date();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      query.warrantyExpiry = { $gte: now, $lte: monthEnd };
    } else if (args.filter === 'expired') {
      query.warrantyExpiry = { $lt: new Date() };
    } else if (args.filter === 'expiring_within_days') {
      query.warrantyExpiry = { $gte: new Date(), $lte: daysFromNow(args.days || 30) };
    } else if (args.filter === 'still_under_warranty') {
      query.warrantyExpiry = { $gte: new Date() };
    } else {
      return { error: `Unknown filter "${args.filter}"` };
    }

    const assets = await Asset.find(query).populate('category vendor').sort({ warrantyExpiry: 1 }).limit(limit);
    return {
      filter: args.filter,
      count: assets.length,
      assets: assets.map(a => ({
        assetTag: a.assetTag, name: a.name, category: a.category?.name, vendor: a.vendor?.name,
        warrantyExpiry: a.warrantyExpiry, status: a.status
      }))
    };
  },

  async get_analytics(args) {
    if (args.metric === 'department_with_most_assets') {
      const departments = await Department.find();
      const breakdown = await Promise.all(departments.map(async d => {
        const employeeIds = await Employee.find({ department: d._id }).distinct('_id');
        const count = await AssetAssignment.countDocuments({ employee: { $in: employeeIds }, status: 'Active' });
        return { department: d.name, assetCount: count };
      }));
      breakdown.sort((a, b) => b.assetCount - a.assetCount);
      return { metric: args.metric, ranking: breakdown, top: breakdown[0] || null };
    }

    if (args.metric === 'vendor_supplied_most_of_category') {
      if (!args.category) return { error: 'category is required for this metric' };
      const categoryId = await resolveIdByName(AssetCategory, args.category);
      if (!categoryId) return { error: `No category found matching "${args.category}"` };
      const results = await Asset.aggregate([
        { $match: { category: categoryId } },
        { $group: { _id: '$vendor', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);
      const vendors = await Vendor.find({ _id: { $in: results.map(r => r._id) } });
      const vendorMap = new Map(vendors.map(v => [String(v._id), v.name]));
      const ranking = results.map(r => ({ vendor: r._id ? (vendorMap.get(String(r._id)) || 'Unknown') : 'Unassigned', count: r.count }));
      return { metric: args.metric, category: args.category, ranking, top: ranking[0] || null };
    }

    if (args.metric === 'average_asset_age') {
      const assets = await Asset.find({ purchaseDate: { $ne: null } }).select('purchaseDate');
      if (!assets.length) return { metric: args.metric, averageAgeYears: 0, sampleSize: 0 };
      const now = Date.now();
      const totalYears = assets.reduce((sum, a) => sum + (now - a.purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365), 0);
      return { metric: args.metric, averageAgeYears: Number((totalYears / assets.length).toFixed(1)), sampleSize: assets.length };
    }

    if (args.metric === 'assets_to_replace_soon') {
      const limit = clamp(args.limit, 10, 30);
      const assets = await Asset.find();
      const repairCounts = await Repair.aggregate([{ $group: { _id: '$asset', count: { $sum: 1 } } }]);
      const repairMap = new Map(repairCounts.map(r => [String(r._id), r.count]));

      const scored = assets.map(a => {
        const ageYears = a.purchaseDate ? (Date.now() - a.purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365) : 0;
        const repairs = repairMap.get(String(a._id)) || 0;
        const conditionScore = { New: 100, Good: 80, Fair: 55, Poor: 25 }[a.condition] ?? 60;
        let score = conditionScore - (ageYears * 5) - (repairs * 8);
        score = Math.max(0, Math.min(100, Math.round(score)));
        return { assetTag: a.assetTag, name: a.name, healthScore: score, ageYears: Number(ageYears.toFixed(1)), repairCount: repairs };
      }).sort((a, b) => a.healthScore - b.healthScore).slice(0, limit);

      return { metric: args.metric, count: scored.length, assets: scored };
    }

    return { error: `Unknown metric "${args.metric}"` };
  },

  async get_report_summary(args) {
    if (args.reportType === 'inventory') {
      const [total, byStatus] = await Promise.all([
        Asset.countDocuments(),
        Asset.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
      ]);
      return { reportType: 'inventory', total, byStatus: byStatus.map(s => ({ status: s._id, count: s.count })) };
    }

    if (args.reportType === 'warranty') {
      const thirtyDays = daysFromNow(30);
      const [expiringSoon, expired, active] = await Promise.all([
        Asset.countDocuments({ warrantyExpiry: { $gte: new Date(), $lte: thirtyDays } }),
        Asset.countDocuments({ warrantyExpiry: { $lt: new Date() } }),
        Asset.countDocuments({ warrantyExpiry: { $gte: new Date() } })
      ]);
      return { reportType: 'warranty', stillUnderWarranty: active, expiringWithin30Days: expiringSoon, expired };
    }

    if (args.reportType === 'vendor') {
      const results = await Asset.aggregate([
        { $group: { _id: '$vendor', count: { $sum: 1 }, totalValue: { $sum: '$purchaseCost' } } },
        { $sort: { count: -1 } }
      ]);
      const vendors = await Vendor.find({ _id: { $in: results.map(r => r._id) } });
      const vendorMap = new Map(vendors.map(v => [String(v._id), v.name]));
      return {
        reportType: 'vendor',
        breakdown: results.map(r => ({ vendor: r._id ? (vendorMap.get(String(r._id)) || 'Unknown') : 'Unassigned', assetCount: r.count, totalValue: r.totalValue }))
      };
    }

    if (args.reportType === 'department') {
      const departments = await Department.find();
      const breakdown = await Promise.all(departments.map(async d => {
        const employeeIds = await Employee.find({ department: d._id }).distinct('_id');
        const count = await AssetAssignment.countDocuments({ employee: { $in: employeeIds }, status: 'Active' });
        return { department: d.name, assetCount: count };
      }));
      return { reportType: 'department', breakdown: breakdown.sort((a, b) => b.assetCount - a.assetCount) };
    }

    if (args.reportType === 'maintenance') {
      const [byStatus, totalCost, topRepaired] = await Promise.all([
        Repair.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        Repair.aggregate([{ $group: { _id: null, total: { $sum: '$cost' } } }]),
        Repair.aggregate([{ $group: { _id: '$asset', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 5 }])
      ]);
      return {
        reportType: 'maintenance',
        byStatus: byStatus.map(s => ({ status: s._id, count: s.count })),
        totalRepairCost: totalCost[0]?.total || 0,
        mostRepairedAssetCount: topRepaired.length
      };
    }

    return { error: `Unknown reportType "${args.reportType}"` };
  }
};

async function executeTool(name, args) {
  const fn = executors[name];
  if (!fn) return { error: `Unknown tool: ${name}` };
  try {
    return await fn(args || {});
  } catch (err) {
    return { error: `Tool execution failed: ${err.message}` };
  }
}

module.exports = { toolDefinitions, executeTool };
