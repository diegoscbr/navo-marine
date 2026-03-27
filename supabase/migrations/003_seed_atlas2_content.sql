DO $$
DECLARE
  p_id uuid := '6f303d86-5763-4ece-aaad-b78d17852f8a';
  s_accuracy uuid;
  s_compass  uuid;
  s_starting uuid;
  s_battery  uuid;
  g_sensors        uuid;
  g_core           uuid;
  g_display        uuid;
  g_battery_storage uuid;
  g_functions      uuid;
BEGIN

-- Box items
INSERT INTO product_box_items (product_id, item_name, sort_order) VALUES
  (p_id, 'Atlas 2',       0),
  (p_id, 'Mount',         1),
  (p_id, 'Carrying case', 2);

-- Section: accuracy
INSERT INTO product_sections (product_id, section_key, heading, body_markdown, sort_order)
VALUES (p_id, 'accuracy',
  'The most accurate instrument on the water. Ever.',
  'Atlas 2 is the first sailing instrument capable of dual-band L1 + L5 GNSS reception, designed to deliver positional accuracy in centimeters.',
  0)
RETURNING id INTO s_accuracy;

INSERT INTO product_feature_bullets (section_id, bullet_text, sort_order) VALUES
  (s_accuracy, 'Optimized for L1 + L5 signals to reduce ionosphere and multi-path errors', 0),
  (s_accuracy, 'Multi-constellation reception: GPS, Galileo, GLONASS, and BeiDou', 1),
  (s_accuracy, '25Hz update rate for faster race-critical feedback', 2),
  (s_accuracy, 'Up to 25cm positional accuracy with RaceSense networks', 3);

-- Section: compass
INSERT INTO product_sections (product_id, section_key, heading, body_markdown, sort_order)
VALUES (p_id, 'compass',
  'A compass that understands what is happening.',
  'A highly sensitive magnetic package, advanced motion fusion, and adjustable damping keep heading data stable in rough conditions.',
  1)
RETURNING id INTO s_compass;

INSERT INTO product_feature_bullets (section_id, bullet_text, sort_order) VALUES
  (s_compass, '0.1 degree heading resolution', 0),
  (s_compass, 'Gyro-stabilized output',         1),
  (s_compass, 'Motion fusion at 50Hz',           2),
  (s_compass, 'Reference angles to track shifts with confidence', 3);

-- Section: starting
INSERT INTO product_sections (product_id, section_key, heading, body_markdown, sort_order)
VALUES (p_id, 'starting',
  'Win the start, control the fleet.',
  'Distance-to-line and time-to-line outputs are tuned for tactical starting decisions so crews can hit the line with speed and timing.',
  2)
RETURNING id INTO s_starting;

INSERT INTO product_feature_bullets (section_id, bullet_text, sort_order) VALUES
  (s_starting, 'Distance-to-line and time-to-line calculations', 0),
  (s_starting, 'Time-to-burn support for synchronized final approach', 1),
  (s_starting, 'Starting screens optimized for situational awareness', 2);

-- Section: battery
INSERT INTO product_sections (product_id, section_key, heading, body_markdown, sort_order)
VALUES (p_id, 'battery',
  '100+ hour battery, wirelessly rechargeable.',
  'Atlas 2 pairs Qi-compatible charging with long endurance so teams can run regatta schedules without constant battery management.',
  3)
RETURNING id INTO s_battery;

INSERT INTO product_feature_bullets (section_id, bullet_text, sort_order) VALUES
  (s_battery, '100+ hour runtime', 0),
  (s_battery, '4600mAh integrated lithium-ion battery', 1),
  (s_battery, 'Fast top-up window supports all-day sessions', 2);

-- Spec group: Sensors
INSERT INTO product_spec_groups (product_id, group_name, sort_order)
VALUES (p_id, 'Sensors', 0) RETURNING id INTO g_sensors;
INSERT INTO product_specs (group_id, label, value, sort_order) VALUES
  (g_sensors, 'GNSS',          '25Hz L1 + L5 dual-band multi-constellation receiver', 0),
  (g_sensors, 'Motion',        '3-axis gyroscope and 3-axis accelerometer', 1),
  (g_sensors, 'Direction',     '3-axis magnetometer', 2),
  (g_sensors, 'Environmental', 'Ambient light and temperature sensors', 3);

-- Spec group: Core Measurements
INSERT INTO product_spec_groups (product_id, group_name, sort_order)
VALUES (p_id, 'Core Measurements', 1) RETURNING id INTO g_core;
INSERT INTO product_specs (group_id, label, value, sort_order) VALUES
  (g_core, 'Position + Velocity',    'High-frequency race telemetry', 0),
  (g_core, 'Heading / Heel / Pitch', 'Derived from stabilized fusion stack', 1),
  (g_core, 'Data Logging',           '10Hz internal logging support', 2);

-- Spec group: Display
INSERT INTO product_spec_groups (product_id, group_name, sort_order)
VALUES (p_id, 'Display', 2) RETURNING id INTO g_display;
INSERT INTO product_specs (group_id, label, value, sort_order) VALUES
  (g_display, 'Screen',     '4.4 inch transflective LCD, 320x240, 91ppi', 0),
  (g_display, 'Visibility', 'Sunlight-readable with 160 degree viewing cone', 1),
  (g_display, 'Lens',       'Optically bonded Gorilla Glass with AR + hydrophobic coating', 2);

-- Spec group: Battery + Storage
INSERT INTO product_spec_groups (product_id, group_name, sort_order)
VALUES (p_id, 'Battery + Storage', 3) RETURNING id INTO g_battery_storage;
INSERT INTO product_specs (group_id, label, value, sort_order) VALUES
  (g_battery_storage, 'Runtime',  '100+ hours typical usage', 0),
  (g_battery_storage, 'Charging', 'Qi-compatible wireless charging', 1),
  (g_battery_storage, 'Storage',  '256MB integrated storage for onboard logs', 2);

-- Spec group: Functions
INSERT INTO product_spec_groups (product_id, group_name, sort_order)
VALUES (p_id, 'Functions', 4) RETURNING id INTO g_functions;
INSERT INTO product_specs (group_id, label, value, sort_order) VALUES
  (g_functions, 'Starting',   'Distance-to-line, time-to-line, time-to-burn', 0),
  (g_functions, 'Race Tools', 'Countdown timer, shift tracking, stripchart, VMG', 1);

END $$;
