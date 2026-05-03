// Re-seed data_1 (Sales Performance 2023) with realistic data
// Also adds lat/lng columns for geo map feature
const pool = require('./db/pool');

const regions = ['North', 'South', 'East', 'West', 'Central'];
const products = ['Laptop Pro', 'Smart Phone X', 'Tablet Air', 'Monitor HD', 'Headphones BT', 'Keyboard Mech', 'Mouse Wireless', 'Webcam HD', 'Speaker JBL', 'Router WiFi6'];
const channels = ['Online', 'Retail', 'Wholesale', 'Direct'];

// US region-based approximate lat/lng with small random scatter
const regionCoords = {
  North:   { lat: 44.5, lng: -93.5 },
  South:   { lat: 30.3, lng: -90.0 },
  East:    { lat: 40.7, lng: -74.0 },
  West:    { lat: 37.7, lng: -122.4 },
  Central: { lat: 41.8, lng: -87.6 },
};

const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const rndF = (min, max, dp = 2) => parseFloat((Math.random() * (max - min) + min).toFixed(dp));
const scatter = (base, spread) => parseFloat((base + (Math.random() - 0.5) * spread).toFixed(4));

const run = async () => {
  const existing = await pool.query('SELECT COUNT(*) as c FROM data_1');
  if (parseInt(existing.rows[0].c) > 0) {
    console.log('data_1 already has', existing.rows[0].c, 'rows — skipping re-seed');
    await pool.end(); return;
  }

  // Add lat/lng columns if they don't exist
  await pool.query(`ALTER TABLE data_1 ADD COLUMN IF NOT EXISTS lat numeric`).catch(() => {});
  await pool.query(`ALTER TABLE data_1 ADD COLUMN IF NOT EXISTS lng numeric`).catch(() => {});
  console.log('✅ lat/lng columns ensured on data_1');

  const rows = [];
  const start = new Date('2023-01-01');
  for (let i = 0; i < 500; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + Math.floor(i * 0.73));
    const qty = rnd(1, 50);
    const unitPrice = rndF(20, 800);
    const discount = rndF(0, 0.35);
    const revenue = parseFloat((qty * unitPrice * (1 - discount)).toFixed(2));
    const cost = parseFloat((revenue * rndF(0.45, 0.75)).toFixed(2));
    const region = regions[i % regions.length];
    const coords = regionCoords[region];
    rows.push([
      i + 1,                                                     // sale_id (integer)
      d.toISOString().slice(0, 10),                              // date (text)
      region,                                                    // region (text)
      products[i % products.length],                            // product (text)
      channels[i % channels.length],                            // channel (text)
      qty,                                                       // quantity (numeric)
      unitPrice,                                                 // unit_price (numeric)
      discount,                                                  // discount (numeric)
      revenue,                                                   // revenue (numeric)
      cost,                                                      // cost (numeric)
      parseFloat((revenue - cost).toFixed(2)),                  // profit (numeric)
      rnd(1, 200),                                              // customer_id (numeric)
      scatter(coords.lat, 3.0),                                 // lat (numeric)
      scatter(coords.lng, 5.0),                                 // lng (numeric)
    ]);
  }

  const cols = ['sale_id','date','region','product','channel','quantity','unit_price','discount','revenue','cost','profit','customer_id','lat','lng'];
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const vals = batch.map((row, bi) =>
      `(${cols.map((c, ci) => `$${bi * cols.length + ci + 1}`).join(',')})`
    ).join(',');
    await pool.query(
      `INSERT INTO data_1 (${cols.map(c => `"${c}"`).join(',')}) VALUES ${vals}`,
      batch.flat()
    );
    process.stdout.write(`  inserting batch ${Math.floor(i/batchSize)+1}/${Math.ceil(rows.length/batchSize)}\r`);
  }

  // Update dataset schema to include lat/lng
  const currentSchema = await pool.query('SELECT schema FROM datasets WHERE id=1');
  const schemaArr = currentSchema.rows[0]?.schema || [];
  const existing_names = schemaArr.map(c => c.name);
  if (!existing_names.includes('lat')) schemaArr.push({ name: 'lat', type: 'numeric' });
  if (!existing_names.includes('lng')) schemaArr.push({ name: 'lng', type: 'numeric' });
  await pool.query('UPDATE datasets SET schema=$1, row_count=500, column_count=$2, updated_at=NOW() WHERE id=1', [JSON.stringify(schemaArr), schemaArr.length]);

  // Update geo_layers for data_1 to use lat/lng columns that now exist
  await pool.query(`UPDATE geo_layers SET lat_col='lat', lng_col='lng', value_col='revenue' WHERE dataset_id=1`);
  console.log('\n✅ data_1 seeded with 500 rows (lat/lng added)');
  console.log('✅ datasets.schema updated with lat/lng columns');
  console.log('✅ geo_layers updated to use lat/lng from data_1');
  await pool.end();
};

run().catch(e => { console.error('SEED ERROR:', e.message, e.detail); process.exit(1); });
