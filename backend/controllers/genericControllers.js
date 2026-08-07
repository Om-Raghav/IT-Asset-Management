// Wires up simple master/reference modules using the generic CRUD factory
const crudFactory = require('../utils/crudFactory');

const Department = require('../models/Department');
const Location = require('../models/Location');
const Employee = require('../models/Employee');
const Vendor = require('../models/Vendor');
const AssetCategory = require('../models/AssetCategory');
const SoftwareLicense = require('../models/SoftwareLicense');
const AMCContract = require('../models/AMCContract');
const Repair = require('../models/Repair');
const Notification = require('../models/Notification');
const Settings = require('../models/Settings');
const Role = require('../models/Role');
const Permission = require('../models/Permission');

module.exports = {
  department: crudFactory(Department, 'Department', '', ['name', 'code']),
  location: crudFactory(Location, 'Location', '', ['name', 'city', 'state', 'country']),
  employee: crudFactory(Employee, 'Employee', 'department location', ['name', 'employeeCode', 'email', 'designation']),
  vendor: crudFactory(Vendor, 'Vendor', '', ['name', 'email', 'contactPerson', 'phone']),
  assetCategory: crudFactory(AssetCategory, 'AssetCategory', '', ['name']),
  softwareLicense: crudFactory(SoftwareLicense, 'SoftwareLicense', 'vendor assignedTo assignedAssets', ['name', 'licenseKey']),
  amcContract: crudFactory(AMCContract, 'AMCContract', 'asset vendor', ['contractNumber', 'coverageDetails']),
  repair: crudFactory(Repair, 'Repair', 'asset vendor', ['issueDescription', 'remarks']),
  notification: crudFactory(Notification, 'Notification', 'user', ['title', 'message']),
  settings: crudFactory(Settings, 'Settings', '', ['key', 'description']),
  role: crudFactory(Role, 'Role', 'permissions', ['name', 'description']),
  permission: crudFactory(Permission, 'Permission', '', ['name', 'module', 'description'])
};
