// Seeds baseline reference data + an initial Admin user.
// Run with: npm run seed
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const connectDB = require('../config/db');
const User = require('../models/User');
const Department = require('../models/Department');
const Location = require('../models/Location');
const AssetCategory = require('../models/AssetCategory');
const Vendor = require('../models/Vendor');
const Employee = require('../models/Employee');
const Asset = require('../models/Asset');
const AssetAssignment = require('../models/AssetAssignment');

const run = async () => {
  await connectDB();

  const adminExists = await User.findOne({ email: 'admin@itams.com' });
  if (!adminExists) {
    await User.create({
      name: 'System Admin',
      email: 'admin@itams.com',
      password: 'Admin@123',
      roleName: 'Admin'
    });
    console.log('Admin user created -> admin@itams.com / Admin@123');
  } else {
    console.log('Admin user already exists, skipping.');
  }

  const categories = ['Laptop', 'Desktop', 'Printer', 'Server', 'Monitor', 'Software'];
  for (const name of categories) {
    await AssetCategory.updateOne({ name }, { name }, { upsert: true });
  }

  const departments = ['IT', 'HR', 'Finance', 'Operations', 'Sales'];
  for (const name of departments) {
    await Department.updateOne({ name }, { name }, { upsert: true });
  }

  const locations = [{ name: 'Head Office', city: 'Jaipur' }, { name: 'Branch Office', city: 'Mumbai' }];
  for (const loc of locations) {
    await Location.updateOne({ name: loc.name }, loc, { upsert: true });
  }

  const vendors = [
    { name: 'Dell Technologies', email: 'sales@dell.com' },
    { name: 'HP Inc.', email: 'sales@hp.com' },
    { name: 'Lenovo', email: 'sales@lenovo.com', contactPerson: 'Rahul Sharma', phone: '9876543210' },
    { name: 'Acer India', email: 'sales@acer.com' },
    { name: 'Apple Inc.', email: 'business@apple.com' }
  ];
  for (const v of vendors) {
    await Vendor.updateOne({ name: v.name }, v, { upsert: true });
  }

  // --- Demo Employee Portal setup: a sample employee + login + assigned asset ---
  const itDept = await Department.findOne({ name: 'IT' });
  const headOffice = await Location.findOne({ name: 'Head Office' });

  let demoEmployee = await Employee.findOne({ employeeCode: 'EMP-001' });
  if (!demoEmployee) {
    demoEmployee = await Employee.create({
      employeeCode: 'EMP-001',
      name: 'John Doe',
      email: 'john.doe@itams.com',
      department: itDept?._id,
      location: headOffice?._id,
      designation: 'Software Engineer',
      status: 'Active'
    });
    console.log('Demo employee created -> John Doe (EMP-001)');
  }

  const employeeUserExists = await User.findOne({ email: 'employee@itams.com' });
  if (!employeeUserExists) {
    await User.create({
      name: 'John Doe',
      email: 'employee@itams.com',
      password: 'Employee@123',
      roleName: 'Employee',
      employee: demoEmployee._id
    });
    console.log('Employee login created -> employee@itams.com / Employee@123');
  } else {
    console.log('Employee login already exists, skipping.');
  }

  const dellVendor = await Vendor.findOne({ name: 'Dell Technologies' });
  const laptopCategory = await AssetCategory.findOne({ name: 'Laptop' });

  let demoAsset = await Asset.findOne({ assetTag: 'IT-0001' });
  if (!demoAsset) {
    demoAsset = await Asset.create({
      assetTag: 'IT-0001',
      name: 'Dell Latitude 5420',
      category: laptopCategory?._id,
      vendor: dellVendor?._id,
      brand: 'Dell',
      model: 'Latitude 5420',
      serialNumber: 'DL5420-DEMO-001',
      purchaseDate: new Date('2023-06-01'),
      purchaseCost: 65000,
      warrantyExpiry: new Date(new Date().setDate(new Date().getDate() + 20)), // expires soon, for testing alerts
      location: headOffice?._id,
      status: 'Assigned',
      condition: 'Good'
    });
    console.log('Demo asset created -> IT-0001 (Dell Latitude 5420)');
  }

  const existingAssignment = await AssetAssignment.findOne({ asset: demoAsset._id, status: 'Active' });
  if (!existingAssignment) {
    await AssetAssignment.create({
      asset: demoAsset._id,
      employee: demoEmployee._id,
      assignedDate: new Date(),
      status: 'Active'
    });
    console.log('Demo asset assigned to John Doe (EMP-001)');
  }

  console.log('Seed data inserted successfully.');
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
