import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Lang = 'fa' | 'en';
export type ThemeMode = 'dark' | 'light';

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

const VEHICLE_FA: Record<string, { name: string; short: string; type: string }> = {
  'VEH-AMR-01': { name: 'ربات کسترل ۰۱ (اتاق تمیز)', short: 'ربات کسترل ۰۱', type: 'ربات خودران' },
  'VEH-AGV-02': { name: 'واگن تایتان ۰۲ (حامل پالت)', short: 'واگن تایتان ۰۲', type: 'حامل پالت' },
  'VEH-FLT-03': { name: 'لیفتراک اطلس ۰۳ (سنگین)', short: 'لیفتراک اطلس ۰۳', type: 'لیفتراک' },
};

const LOCATION_FA: Record<string, { code: string; name: string }> = {
  'DOCK-IN-01': { code: 'سکوی ورودی ۰۱', name: 'سکوی تخلیه و دریافت ورودی ۰۱' },
  'LOC-DOCK-IN-01': { code: 'سکوی ورودی ۰۱', name: 'سکوی تخلیه و دریافت ورودی ۰۱' },
  'DOCK-OUT-01': { code: 'سکوی خروجی ۰۱', name: 'سکوی ارسال و بارگیری خروجی ۰۱' },
  'LOC-DOCK-OUT-01': { code: 'سکوی خروجی ۰۱', name: 'سکوی ارسال و بارگیری خروجی ۰۱' },
  'PARK-01': { code: 'پارکینگ ناوگان ۰۱', name: 'ایستگاه توقف و شارژ ناوگان ۰۱' },
  'LOC-PARK-01': { code: 'پارکینگ ناوگان ۰۱', name: 'ایستگاه توقف و شارژ ناوگان ۰۱' },
  'BIN-A1-01': { code: 'جایگاه الف۱-۰۱', name: 'قفسه الف۱ ردیف ۱ جایگاه ۰۱' },
  'LOC-BIN-A1-01': { code: 'جایگاه الف۱-۰۱', name: 'قفسه الف۱ ردیف ۱ جایگاه ۰۱' },
  'BIN-A1-02': { code: 'جایگاه الف۱-۰۲', name: 'قفسه الف۱ ردیف ۱ جایگاه ۰۲' },
  'LOC-BIN-A1-02': { code: 'جایگاه الف۱-۰۲', name: 'قفسه الف۱ ردیف ۱ جایگاه ۰۲' },
  'BIN-A2-01': { code: 'جایگاه الف۲-۰۱', name: 'قفسه الف۲ جایگاه پرتردد ۰۱' },
  'LOC-BIN-A2-01': { code: 'جایگاه الف۲-۰۱', name: 'قفسه الف۲ جایگاه پرتردد ۰۱' },
  'BIN-B1-01': { code: 'جایگاه ب۱-۰۱ (قرنطینه)', name: 'جایگاه قرنطینه کنترل کیفیت ب۱-۰۱' },
  'LOC-BIN-B1-01': { code: 'جایگاه ب۱-۰۱ (قرنطینه)', name: 'جایگاه قرنطینه کنترل کیفیت ب۱-۰۱' },
  'BIN-B1-02': { code: 'جایگاه ب۱-۰۲', name: 'قفسه ب۱ جایگاه عمومی ۰۲' },
  'LOC-BIN-B1-02': { code: 'جایگاه ب۱-۰۲', name: 'قفسه ب۱ جایگاه عمومی ۰۲' },
  'STAGE-OUT-01': { code: 'ایستگاه خروج ۰۱', name: 'منطقه آماده‌سازی خروج ۰۱' },
  'LOC-STAGE-OUT-01': { code: 'ایستگاه خروج ۰۱', name: 'منطقه آماده‌سازی خروج ۰۱' },
  'AIRLOCK-01': { code: 'هوابند ۰۱', name: 'هوابند دارویی انتقال مواد ۰۱' },
  'LOC-AIRLOCK-01': { code: 'هوابند ۰۱', name: 'هوابند دارویی انتقال مواد ۰۱' },
  'BUF-IN-01': { code: 'بافر ورودی ۰۱', name: 'بافر ورودی خط گرانولاسیون' },
  'LOC-BUF-IN-01': { code: 'بافر ورودی ۰۱', name: 'بافر ورودی خط گرانولاسیون' },
  'MCH-MIXER-01': { code: 'میکسر ۰۱', name: 'میکسر برشی پرسرعت ۰۱' },
  'LOC-MCH-MIXER-01': { code: 'میکسر ۰۱', name: 'میکسر برشی پرسرعت ۰۱' },
  'MCH-COATER-01': { code: 'پوشش‌دهنده ۰۱', name: 'دستگاه پوشش‌دهنده بستر سیال ۰۱' },
  'LOC-MCH-COATER-01': { code: 'پوشش‌دهنده ۰۱', name: 'دستگاه پوشش‌دهنده بستر سیال ۰۱' },
  'BUF-FILL-01': { code: 'بافر پرکنی ۰۱', name: 'بافر ورودی خط پرکنی استریل' },
  'LOC-BUF-FILL-01': { code: 'بافر پرکنی ۰۱', name: 'بافر ورودی خط پرکنی استریل' },
  'MCH-FILLER-02': { code: 'ویال‌پرکن ۰۲', name: 'دستگاه ویال‌پرکن استریل ۰۲' },
  'LOC-MCH-FILLER-02': { code: 'ویال‌پرکن ۰۲', name: 'دستگاه ویال‌پرکن استریل ۰۲' },
  'MCH-CAPPER-02': { code: 'درپوش‌گذار ۰۲', name: 'دستگاه درپوش‌گذار و درب‌بندی استریل ۰۲' },
  'LOC-MCH-CAPPER-02': { code: 'درپوش‌گذار ۰۲', name: 'دستگاه درپوش‌گذار و درب‌بندی استریل ۰۲' },
};

const ZONE_FA: Record<string, string> = {
  'WH-MAIN': 'سالن اصلی انبار',
  'WH-QUARANTINE': 'محوطه قرنطینه کنترل کیفیت',
  'AIRLOCK-ZONE': 'محفظه هوابند دارویی',
  'ROOM-PREP-01': 'سوئیت گرانولاسیون و آماده‌سازی',
  'ROOM-FILL-01': 'سوئیت پرکنی استریل',
};

const GRADE_FA: Record<string, string> = {
  Warehouse: 'انبار عمومی',
  'Grade D': 'کلاس تمیزی د',
  'Grade C': 'کلاس تمیزی ج',
  'Grade B': 'کلاس تمیزی ب',
  'Grade A': 'کلاس تمیزی الف',
};

const EDGE_FA: Record<string, string> = {
  'LANE-MAIN-01': 'گذرگاه اصلی ۱',
  'LANE-MAIN-02': 'گذرگاه اصلی ۲',
  'EDGE-NARROW-01': 'میانبر باریک ۰۱',
  'LANE-AIRLOCK-IN': 'ورودی هوابند',
  'LANE-AIRLOCK-OUT': 'خروجی هوابند',
  'LANE-N-01': 'گذرگاه شمالی ۱',
  'LANE-N-02': 'گذرگاه شمالی ۲',
  'LANE-S-01': 'گذرگاه جنوبی ۱',
  'LANE-TO-AIRLOCK': 'مسیر اتصال هوابند',
  'LANE-SPINE-STAGE': 'انشعاب ایستگاه خروج',
};

const ACTOR_FA: Record<string, { name: string; role: string }> = {
  'DISP-01': { name: 'دیسپچر ۰۱', role: 'مسئول اعزام' },
  'OP-01': { name: 'اپراتور ۰۱', role: 'اپراتور صحن' },
  'SUP-01': { name: 'سرپرست ۰۱', role: 'سرپرست سایت' },
  'QA-01': { name: 'کنترل کیفیت ۰۱', role: 'تضمین کیفیت' },
  'VIEW-01': { name: 'ناظر ۰۱', role: 'بازبین فقط‌خواندنی' },
  'TRAFFIC-MANAGER': { name: 'مدیر ترافیک', role: 'خودکار' },
  'TELEMETRY-MONITOR': { name: 'پایشگر تله‌متری', role: 'خودکار' },
};

const ASSET_FA: Record<string, { code: string; name: string }> = {
  'AIRLOCK-01': { code: 'هوابند ۰۱', name: 'هوابند دارویی انتقال مواد ۰۱' },
  'LINE-GRAN-01': { code: 'خط گرانولاسیون ۰۱', name: 'خط گرانولاسیون و آماده‌سازی ۰۱' },
  'BUF-IN-01': { code: 'بافر ورودی ۰۱', name: 'بافر ورودی آماده‌سازی' },
  'MCH-MIXER-01': { code: 'میکسر ۰۱', name: 'میکسر برشی پرسرعت ۰۱' },
  'MCH-COATER-01': { code: 'پوشش‌دهنده ۰۱', name: 'پوشش‌دهنده بستر سیال ۰۱' },
  'LINE-FILL-02': { code: 'خط پرکنی ۰۲', name: 'خط پرکنی ویال استریل ۰۲' },
  'BUF-FILL-01': { code: 'بافر پرکنی ۰۱', name: 'بافر خط پرکنی استریل' },
  'MCH-FILLER-02': { code: 'ویال‌پرکن ۰۲', name: 'دستگاه ویال‌پرکن استریل ۰۲' },
  'MCH-CAPPER-02': { code: 'درپوش‌گذار ۰۲', name: 'دستگاه درپوش‌گذار و درب‌بندی ۰۲' },
};

const PALLET_FA: Record<string, { code: string; label: string }> = {
  'PLT-1001': { code: 'پالت ۱۰۰۱', label: 'پالت بشکه ماده مؤثره سفازولین' },
  'PLT-1002': { code: 'پالت ۱۰۰۲', label: 'پالت مانیتول گرید دارویی ۲۶۰۴' },
  'PLT-1003': { code: 'پالت ۱۰۰۳', label: 'پالت ویال شیشه‌ای نوع ۱ (قرنطینه)' },
  'PLT-1004': { code: 'پالت ۱۰۰۴', label: 'پالت محصول نهایی بچ ۲۶۱۱-الف' },
};

const SKU_ITEM_FA: Record<string, string> = {
  'RM-CEFA-API': 'ماده مؤثره استریل سفازولین سدیم (بشکه ۲۵ کیلویی)',
  'RM-MANN-EXC': 'مانیتول گرید دارویی پرلیتول',
  'PK-VIAL-10ML': 'ویال شیشه‌ای استریل بوروسیلیکات ۱۰ میلی‌لیتری',
  'FG-CEFA-1G': 'بسته تزریقی سفازولین ۱ گرم',
};

const BOM_FA: Record<string, { wo: string; product: string }> = {
  'BOM-01': { wo: 'سفارش کار ۴۰۹', product: 'پودر تزریقی سفازولین ۱ گرم' },
  'BOM-02': { wo: 'سفارش کار ۴۱۲', product: 'ترکیب جانبی سفازولین' },
};

const MAINTENANCE_FA: Record<string, string> = {
  'PM-FILLER-02': 'نگهداری پیشگیرانه ویال‌پرکن ۰۲',
  'CAL-COATER-01': 'کالیبراسیون پوشش‌دهنده ۰۱',
};

const OPPORTUNITY_FA: Record<string, { title: string; rationale: string }> = {
  'SLOT-01': {
    title: 'انتقال ماده مؤثره پرتردد (پالت ۱۰۰۱) به نزدیکی هوابند',
    rationale: 'جایگاه الف۱-۰۱ از محور پرترافیک مرکزی عبور می‌کند؛ انتقال به جایگاه الف۲-۰۱ پیمایش خالی را کاهش می‌دهد.',
  },
  'SLOT-02': {
    title: 'تغذیه مجدد بافر ورودی خط گرانولاسیون',
    rationale: 'سفارش کار ۴۰۹ نیازمند ۱۶ کیلوگرم ماده مؤثره سفازولین است و موجودی مانیتول در حال رسیدن به آستانه سفارش مجدد است.',
  },
};

const FLAG_FA: Record<string, string> = {
  'dt.safety.physicalActuationAllowed': 'مجوز ایمنی عملگر فیزیکی',
  'dt.ep05.semanticCommands': 'پذیرش فرمان‌های معنایی',
  'dt.ep05.weightedAstar': 'مسیریابی وزن‌دار هوشمند',
  'dt.ep05.edgeReservations': 'رزرو بازه زمانی مسیرها',
  'dt.ep05.autoDeadlockResolve': 'رفع خودکار بن‌بست ترافیکی',
  'dt.ep05.dynamicReroute': 'تغییر مسیر پویا در انسداد',
  'dt.ep05.autoDispatch': 'تخصیص خودکار خودرو',
};

const TOPIC_FA: Record<string, string> = {
  'twin.mission.transition': 'تغییر وضعیت مأموریت',
  'twin.mission.rerouted': 'بازطراحی مسیر مأموریت',
  'twin.mission.override': 'مداخله دستی مأموریت',
  'twin.traffic.reservation': 'رزرو بازه زمانی مسیر',
  'twin.traffic.reservation_released': 'آزادسازی دستی رزرو مسیر',
  'twin.traffic.deadlock_resolved': 'رفع بن‌بست ترافیکی',
  'twin.topology.closure': 'تغییر وضعیت انسداد مسیر',
  'twin.task.created': 'تعریف تسک جدید برای آبجکت',
  'twin.task.updated': 'تغییر وضعیت تسک عملیاتی',
  'twin.vehicle.pose': 'تله‌متری موقعیت خودرو',
  'twin.vehicle.stale': 'هشدار قطع تله‌متری خودرو',
  'twin.vehicle.estop': 'توقف اضطراری خودرو',
  'twin.vehicle.attachment': 'تغییر وضعیت بار متصل',
  'twin.wms.inventory': 'به‌روزرسانی موجودی انبار',
  'twin.wms.qa_changed': 'تغییر وضعیت کنترل کیفیت',
  'twin.mes.bom_handoff': 'تحویل مواد سفارش ساخت',
  'twin.mes.machine_state': 'تغییر وضعیت ماشین تولید',
  'twin.mes.maintenance': 'تغییر پنجره تعمیرات',
  'twin.audit.security': 'ممیزی امنیتی و دسترسی',
  'twin.config.updated': 'به‌روزرسانی پیکربندی کنترل‌پلین',
  'twin.flag.updated': 'تغییر پرچم قابلیت سامانه',
  'twin.safety.actuation_mode_changed': 'تغییر حالت عملگر ایمنی',
};

const ERROR_CODE_FA: Record<string, string> = {
  VALIDATION_ERROR: 'خطای اعتبارسنجی ورودی',
  LOCATION_NOT_FOUND: 'مکان موردنظر یافت نشد',
  LOCATION_AMBIGUOUS: 'شناسه مکان مبهم است',
  UNAUTHORIZED_RBAC: 'عدم مجوز دسترسی نقش کاربری',
  UNAUTHORIZED_SPATIAL_ABAC: 'محدودیت دسترسی منطقه‌ای',
  UNREACHABLE_ROUTE: 'مسیر قابل پیمایش یافت نشد',
  INCOMPATIBLE_VEHICLE: 'خودرو با محدودیت ابعاد یا کلاس سازگار نیست',
  RESERVATION_CONFLICT: 'تداخل رزرو زمانی مسیر',
  IDEMPOTENCY_CONFLICT: 'تضاد کلید یکتای فرمان',
  INVALID_STATE_TRANSITION: 'تغییر وضعیت غیرمجاز',
  QA_QUARANTINE_BLOCKED: 'مسدودشده توسط قرنطینه کنترل کیفیت',
  GMP_AIRLOCK_REQUIRED: 'عبور از هوابند دارویی الزامی است',
  MAINTENANCE_CONFLICT: 'تضاد با پنجره تعمیرات فعال',
  E_STOP_ACTIVE: 'توقف اضطراری فعال است',
  FEATURE_DISABLED: 'این قابلیت در کنترل‌پلین غیرفعال است',
  SAFETY_INTERLOCK_REQUIRED: 'تأیید دوگانه و اینترلاک ایمنی الزامی است',
  RESOURCE_NOT_FOUND: 'موجودیت موردنظر یافت نشد',
  INTERNAL_ERROR: 'خطای داخلی سرور',
};

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    appTitle: 'Gradian Digital Twin',
    navSiteOverview: 'Site Overview',
    navWarehouse: 'Warehouse Wing',
    navAirlock: 'GMP Airlock',
    navProduction: 'Production Suites',
    activeOperatorLabel: 'Active Operator Role',
    dispatchMoveCta: 'Dispatch Move',
    liveStream: 'Live Stream',
    reconnecting: 'Reconnecting',
    selectedPrefix: 'Selected',
    selectedVehicle: 'vehicle',
    selectedLocation: 'location',
    selectedAsset: 'asset',
    selectedPallet: 'pallet',
    closeInspector: 'Close selection inspector',
    connectingBanner: 'Connecting to Gradian Digital Twin Operations Server...',
    showDock: 'Show Operations Dock (H)',
    hideDock: 'Hide Controls (H)',
    tabTraffic: 'Traffic & Missions',
    tabControl: 'Control Plane',
    tabFleet: 'Fleet & Controls',
    tabWms: 'WMS Twin',
    tabMes: 'MES & GMP',
    tabEvents: 'Events & Audit',
    overlaysLabel: 'Overlays:',
    overlayLanes: 'Lanes',
    overlayOccupancy: 'Occupancy',
    overlayHeatmaps: 'Heatmaps',
    overlayOee: 'OEE',
    overlayBatch: 'Batch Path',
    semanticMoveCmd: 'Semantic Move Command',
    newKey: 'New Key',
    origin: 'Origin',
    destination: 'Destination',
    vehicle: 'Vehicle',
    autoAssign: 'Auto-Assign',
    costProfile: 'Cost Profile',
    gs1Load: 'GS1 Load',
    emptyRun: 'Empty Run',
    dryRun: 'Dry-Run',
    closuresLabel: 'Closures:',
    block: 'Block',
    unblock: 'Unblock',
    missionsTitle: 'Missions',
    reservationsTitle: 'Reservations',
    deadlocksResolved: 'Deadlocks Resolved',
    noMissionsEmpty: 'No active or historical missions yet. Select origin/destination and click Dispatch Move.',
    unassigned: 'unassigned',
    replansLabel: 'replans',
    whyBtn: 'Why?',
    pauseBtn: 'Pause',
    resumeBtn: 'Resume',
    replanBtn: 'Replan',
    safeStopBtn: 'Safe Stop',
    decisionExplainTitle: 'Decision Explainability',
    autoDispatchTag: 'Auto-Dispatch',
    explicitVehicleTag: 'Explicit Vehicle',
    closeBtn: 'Close',
    astarExpanded: 'A* Expanded',
    costLabel: 'Cost',
    distanceLabel: 'Distance',
    rejectedTag: 'REJECTED',
    reassignPrefix: 'Reassign →',
    applyReassign: 'Apply Reassign',
    activeReservations: 'Active Reservations:',
    clickReleaseTitle: 'Click to manually release edge reservation',
    safetyActuationMode: 'Safety Actuation Mode',
    physicalGateWarning: 'Requires flag + Supervisor/Dispatcher + Dual Confirmation:',
    confirmPhrasePlaceholder: 'Type ENABLE_PHYSICAL_INTERLOCK',
    secondApproverPrefix: '2nd Approver:',
    applyMode: 'Apply Mode',
    featureFlagsTitle: 'Feature Flags (Site Scope)',
    onLabel: 'ON',
    offLabel: 'OFF',
    dispatchScoringTraffic: 'Dispatch Scoring & Traffic',
    saveDispatch: 'Save Dispatch',
    wDistance: 'wDistance',
    wBattery: 'wBattery',
    wWorkload: 'wWorkload',
    wCapabilityFit: 'wCapabilityFit',
    minBatteryPct: 'minBattery %',
    maxQueueDepth: 'maxQueueDepth',
    intersectionPolicy: 'Intersection Policy',
    deadlockPolicy: 'Deadlock Policy',
    routingCostsLimits: 'Routing Costs & Mission Limits',
    saveRouting: 'Save Routing',
    costDistance: 'cost.distance',
    costTurn: 'cost.turn',
    costCongestion: 'cost.congestion',
    maxExpandNodes: 'maxExpandNodes',
    maxReplans: 'maxReplans',
    deviationThresh: 'deviationThresh (m)',
    defaultCostProfile: 'Default Cost Profile',
    poseLabel: 'Pose',
    batteryShort: 'Bat',
    sizeLabel: 'Size',
    maxLabel: 'Max',
    gradesLabel: 'Grades',
    loadLabel: 'Load',
    noneLabel: 'None',
    ackEstop: 'Ack E-Stop',
    eStopBtn: 'E-Stop',
    recoverTelemetry: 'Recover Telemetry',
    staleTest: 'Stale Test',
    carryingLabel: 'Carrying',
    zonesLabel: 'Zones',
    utilizedLabel: 'utilized',
    calLabel: 'Cal',
    ssccLabel: 'SSCC',
    qaLabel: 'QA',
    weightLabel: 'Weight',
    cartonLabel: 'Carton',
    gtinLabel: 'GTIN',
    lotLabel: 'Lot',
    itemLabel: 'Item',
    expLabel: 'Exp',
    wmsPlaceholder: 'Search GTIN, Lot (LOT-API-2601), Serial (SN-8801), SSCC...',
    findJump3d: 'Find & Jump 3D',
    matchedLabel: 'Matched',
    atLabel: 'at',
    inTransitLabel: 'In Transit',
    inboundOutboundFlows: 'Inbound / Outbound Material Flows',
    slottingInsights: 'Slotting & Replenishment Insights',
    travelReduction: 'travel',
    bomHandoffTitle: 'BOM Demand → Material Handoff',
    dispatchHandoff: 'Dispatch Handoff',
    stateLabel: 'State',
    genealogyTitle: 'Genealogy',
    hide3dPath: 'Hide 3D Path',
    show3dPath: 'Show 3D Path',
    inputsLabel: 'Inputs',
    activeBlocksDispatch: 'ACTIVE (Blocks Dispatch)',
    clearedLabel: 'Cleared',
    testDirectGmp: 'Test Direct GMP Transfer',
    gmpAllowed: 'Allowed',
    gmpBlocked: 'Blocked',
    airlockRequired: 'Airlock required',
    metricsTitle: 'Operational Metrics & Safety Boundary',
    acceptedRejected: 'Accepted / Rejected',
    replansDeadlocks: 'Replans / Deadlocks',
    staleEstop: 'Stale / E-Stop',
    safetyGateway: 'Safety Gateway',
    noDirectIo: 'No Direct I/O',
    gatewayIntentsLogged: 'Gateway intents logged:',
    liveEventBackbone: 'Live Scoped Event Backbone (WebSocket Outbox)',
    actorLabel: 'actor',
    themeDark: 'Dark',
    themeLight: 'Light',
    langFa: 'فارسی',
    langEn: 'EN',
    focusCamTitle: 'Focus camera on object',
    tabRelatedTasks: 'Related Tasks',
    tabNewTask: 'New Task',
    taskModeOperational: 'Project Task',
    taskModeMove: 'Move Mission',
    taskModeMesWindow: 'MES Window',
    relatedMissionsTitle: 'Assigned & Linked Missions',
    relatedProjectTasksTitle: 'Object Tasks & SOPs',
    relatedBomTitle: 'Linked BOM Demands',
    relatedMaintenanceTitle: 'Maintenance & Calibration Windows',
    relatedFlowsTitle: 'Material Flows & Pallets',
    noRelatedTasksYet: 'No tasks or missions linked to this object yet.',
    createFirstTaskCta: '+ Define First Task',
    taskPresetsLabel: 'Project Quick Presets:',
    taskTitleLabel: 'Task Title',
    taskTitlePlaceholder: 'e.g. Inspect HEPA filter differential pressure',
    taskCategoryLabel: 'Category',
    taskPriorityLabel: 'Priority',
    taskNotesLabel: 'Notes / SOP Reference',
    taskNotesPlaceholder: 'Optional notes, batch ID, or SOP instructions...',
    createTaskBtn: 'Save Object Task',
    directionLabel: 'Direction',
    dirSendFromHere: 'Dispatch From Here',
    dirBringHere: 'Bring To Here',
    dispatchMissionBtn: 'Dispatch Mission',
    mesWindowTypeLabel: 'Window Type',
    mesTypePm: 'Preventive Maintenance (PM)',
    mesTypeCal: 'Calibration',
    mesTypeRun: 'Production Run',
    blocksDispatchLabel: 'Block vehicle dispatch during window',
    activateImmediatelyLabel: 'Activate immediately',
    createMesWindowBtn: 'Create MES Window',
    startTaskBtn: 'Start',
    completeTaskBtn: 'Complete',
    cancelTaskBtn: 'Cancel',
    quickReleaseBtn: 'Release QA',
    quickQuarantineBtn: 'Quarantine',
    activateBtn: 'Activate',
    clearBtn: 'Clear',
    startImmediatelyLabel: 'Start operation immediately on object',
    activeProcessBadge: 'Process Active',
    autoOpsLabel: 'Auto-Operations',
    autoOpsActive: 'Autonomous Active',
    autoOpsPaused: 'Autonomous Paused',
    pauseAutoOps: 'Pause Auto',
    resumeAutoOps: 'Resume Auto',
    simSpeedLabel: 'Speed',
    activeFleetKpi: 'Active Fleet',
    completedMovesKpi: 'Completed',
    avgOeeKpi: 'Avg OEE',
    activeTasksKpi: 'Live Tasks',
    liveFleetTracker: 'Live Fleet Telemetry',
    routeProgressLabel: 'Progress',
    idleParked: 'Idle · Ready',
    enRouteTo: 'En route →',
    cpTabSafety: 'Safety & Actuation',
    cpTabFlags: 'Feature Flags',
    cpTabDispatch: 'Dispatch & Traffic',
    cpTabRouting: 'Routing & Guardrails',
    cpSafetyDesc: 'Control physical actuation interlocks and dual confirmation policy',
    cpFlagsDesc: 'Enable or suspend site operational capabilities in real time',
    cpDispatchDesc: 'Tune vehicle scoring weights, queue caps, and intersection rules',
    cpRoutingDesc: 'Adjust A* pathfinding multipliers, replan caps, and default profile',
    dockGroupOps: 'Site Operations',
    dockGroupSys: 'System Control',
    layersPanelTitle: '3D Layers',
    reasonLabel: 'Change Reason',
  },
  fa: {
    appTitle: 'دوقلوی دیجیتال گرادیان',
    navSiteOverview: 'نمای کل سایت',
    navWarehouse: 'بخش انبار',
    navAirlock: 'هوابند دارویی',
    navProduction: 'سوئیت‌های تولید',
    activeOperatorLabel: 'نقش اپراتور فعال',
    dispatchMoveCta: 'اعزام مأموریت',
    liveStream: 'جریان زنده برقرار',
    reconnecting: 'در حال اتصال مجدد',
    selectedPrefix: 'انتخاب‌شده:',
    selectedVehicle: 'خودرو',
    selectedLocation: 'مکان',
    selectedAsset: 'تجهیز',
    selectedPallet: 'پالت',
    closeInspector: 'بستن پنجره جزئیات',
    connectingBanner: 'در حال اتصال به سرور عملیات دوقلوی دیجیتال گرادیان...',
    showDock: 'نمایش میز عملیات (کلید H)',
    hideDock: 'پنهان کردن پنل (کلید H)',
    tabTraffic: 'ترافیک و مأموریت‌ها',
    tabControl: 'کنترل‌پلین و تنظیمات',
    tabFleet: 'ناوگان و کنترل خودروها',
    tabWms: 'دوقلوی انبار',
    tabMes: 'تولید و انطباق دارویی',
    tabEvents: 'رویدادها و ممیزی',
    overlaysLabel: 'لایه‌های سه‌بعدی:',
    overlayLanes: 'مسیرها',
    overlayOccupancy: 'ظرفیت قفسه‌ها',
    overlayHeatmaps: 'نقشه گرمایی ترافیک',
    overlayOee: 'بهره‌وری تجهیزات',
    overlayBatch: 'مسیر بچ تولید',
    semanticMoveCmd: 'فرمان جابه‌جایی معنایی',
    newKey: 'کلید یکتای جدید',
    origin: 'مبدأ',
    destination: 'مقصد',
    vehicle: 'خودرو',
    autoAssign: 'تخصیص خودکار',
    costProfile: 'الگوی مسیریابی',
    gs1Load: 'بار استاندارد',
    emptyRun: 'حرکت بدون بار',
    dryRun: 'آزمایش مسیر',
    closuresLabel: 'انسداد مسیرها:',
    block: 'مسدودکردن',
    unblock: 'بازگشایی',
    missionsTitle: 'مأموریت‌ها',
    reservationsTitle: 'رزرو مسیرها',
    deadlocksResolved: 'بن‌بست‌های رفع‌شده',
    noMissionsEmpty: 'هنوز مأموریتی ثبت نشده است. مبدأ و مقصد را انتخاب کرده و روی اعزام مأموریت کلیک کنید.',
    unassigned: 'تخصیص‌نیافته',
    replansLabel: 'بازطراحی',
    whyBtn: 'چرا؟',
    pauseBtn: 'توقف موقت',
    resumeBtn: 'ادامه',
    replanBtn: 'بازطراحی مسیر',
    safeStopBtn: 'توقف ایمن',
    decisionExplainTitle: 'شفاف‌سازی تصمیم‌گیری',
    autoDispatchTag: 'تخصیص خودکار',
    explicitVehicleTag: 'انتخاب دستی خودرو',
    closeBtn: 'بستن',
    astarExpanded: 'گره‌های بررسی‌شده',
    costLabel: 'هزینه کل',
    distanceLabel: 'مسافت',
    rejectedTag: 'ردشده',
    reassignPrefix: 'انتقال به ←',
    applyReassign: 'اعمال جابه‌جایی',
    activeReservations: 'رزروهای فعال مسیر:',
    clickReleaseTitle: 'برای آزادسازی دستی رزرو مسیر کلیک کنید',
    safetyActuationMode: 'حالت ایمنی عملگر سامانه',
    physicalGateWarning: 'نیازمند پرچم مجوز + سرپرست/دیسپچر + تأیید دوگانه است:',
    confirmPhrasePlaceholder: 'عبارت ENABLE_PHYSICAL_INTERLOCK را وارد کنید',
    secondApproverPrefix: 'تأییدکننده دوم:',
    applyMode: 'اعمال حالت',
    featureFlagsTitle: 'پرچم‌های قابلیت (در سطح سایت)',
    onLabel: 'فعال',
    offLabel: 'غیرفعال',
    dispatchScoringTraffic: 'وزن‌دهی تخصیص و سیاست ترافیک',
    saveDispatch: 'ذخیره تخصیص',
    wDistance: 'ضریب فاصله',
    wBattery: 'ضریب باتری',
    wWorkload: 'ضریب بار کاری',
    wCapabilityFit: 'ضریب انطباق فنی',
    minBatteryPct: 'حداقل باتری (٪)',
    maxQueueDepth: 'سقف صف خودرو',
    intersectionPolicy: 'سیاست تقاطع‌ها',
    deadlockPolicy: 'سیاست رفع بن‌بست',
    routingCostsLimits: 'ضرایب مسیریابی و محدودیت مأموریت',
    saveRouting: 'ذخیره مسیریابی',
    costDistance: 'هزینه فاصله',
    costTurn: 'هزینه چرخش',
    costCongestion: 'هزینه ازدحام',
    maxExpandNodes: 'سقف گره جستجو',
    maxReplans: 'سقف بازطراحی مسیر',
    deviationThresh: 'آستانه انحراف (متر)',
    defaultCostProfile: 'الگوی پیش‌فرض مسیریابی',
    poseLabel: 'مختصات',
    batteryShort: 'باتری',
    sizeLabel: 'ابعاد',
    maxLabel: 'ظرفیت',
    gradesLabel: 'کلاس‌های مجاز',
    loadLabel: 'محموله',
    noneLabel: 'بدون بار',
    ackEstop: 'تأیید رفع اضطراری',
    eStopBtn: 'توقف اضطراری',
    recoverTelemetry: 'بازیابی تله‌متری',
    staleTest: 'شبیه‌سازی قطع حسگر',
    carryingLabel: 'در حال حمل',
    zonesLabel: 'ناحیه‌های مجاز',
    utilizedLabel: 'تکمیل ظرفیت',
    calLabel: 'کالیبراسیون',
    ssccLabel: 'کد رهگیری پالت',
    qaLabel: 'کیفیت',
    weightLabel: 'وزن',
    cartonLabel: 'کارتن',
    gtinLabel: 'کد کالا',
    lotLabel: 'شماره بچ',
    itemLabel: 'قلم کالا',
    expLabel: 'انقضا',
    wmsPlaceholder: 'جستجوی کد کالا، شماره بچ، سریال یا کد پالت...',
    findJump3d: 'جستجو و نمایش سه‌بعدی',
    matchedLabel: 'یافت شد:',
    atLabel: 'در موقعیت',
    inTransitLabel: 'در حال حمل',
    inboundOutboundFlows: 'جریان‌های ورودی و خروجی کالا',
    slottingInsights: 'پیشنهادهای چیدمان و تغذیه هوشمند',
    travelReduction: 'کاهش پیمایش',
    bomHandoffTitle: 'تقاضای فرمول ساخت ← تحویل مواد',
    dispatchHandoff: 'اعزام تحویل مواد',
    stateLabel: 'وضعیت',
    genealogyTitle: 'شجره‌نامه و ردیابی بچ',
    hide3dPath: 'پنهان کردن مسیر سه‌بعدی',
    show3dPath: 'نمایش مسیر سه‌بعدی',
    inputsLabel: 'مواد اولیه ورودی',
    activeBlocksDispatch: 'فعال (مانع اعزام)',
    clearedLabel: 'پایان‌یافته',
    testDirectGmp: 'آزمایش انتقال مستقیم بدون هوابند',
    gmpAllowed: 'مجاز است',
    gmpBlocked: 'مسدود شد',
    airlockRequired: 'عبور از هوابند دارویی الزامی است',
    metricsTitle: 'شاخص‌های عملیاتی و مرز ایمنی',
    acceptedRejected: 'پذیرفته‌شده / ردشده',
    replansDeadlocks: 'بازطراحی / رفع بن‌بست',
    staleEstop: 'قطع حسگر / توقف اضطراری',
    safetyGateway: 'دروازه ایمنی فیزیکی',
    noDirectIo: 'بدون فرمان مستقیم سخت‌افزار',
    gatewayIntentsLogged: 'فرمان‌های ثبت‌شده در دروازه ایمنی:',
    liveEventBackbone: 'جریان زنده رویدادهای سایت (صندوق وب‌سوکت)',
    actorLabel: 'عامل',
    themeDark: 'حالت تاریک',
    themeLight: 'حالت روشن',
    langFa: 'فارسی',
    langEn: 'EN',
    focusCamTitle: 'تمرکز دوربین روی آبجکت',
    tabRelatedTasks: 'وظایف مرتبط',
    tabNewTask: 'تعریف تسک جدید',
    taskModeOperational: 'تسک عملیاتی پروژه',
    taskModeMove: 'مأموریت جابه‌جایی',
    taskModeMesWindow: 'پنجره تعمیرات / بچ',
    relatedMissionsTitle: 'مأموریت‌های حمل‌ونقل مرتبط',
    relatedProjectTasksTitle: 'تسک‌های عملیاتی و کنترل پروژه',
    relatedBomTitle: 'تقاضاهای فرمول ساخت (BOM)',
    relatedMaintenanceTitle: 'پنجره‌های تعمیر و کالیبراسیون',
    relatedFlowsTitle: 'جریان‌های کالا و پالت‌ها',
    noRelatedTasksYet: 'هنوز هیچ تسک یا مأموریتی برای این آبجکت ثبت نشده است.',
    createFirstTaskCta: '+ تعریف اولین تسک',
    taskPresetsLabel: 'الگوهای آماده بر اساس نیاز پروژه:',
    taskTitleLabel: 'عنوان تسک',
    taskTitlePlaceholder: 'مثلاً: بازبینی فشار مثبت هوابند یا شمارش پالت',
    taskCategoryLabel: 'دسته‌بندی',
    taskPriorityLabel: 'اولویت',
    taskNotesLabel: 'توضیحات / شماره دستورالعمل',
    taskNotesPlaceholder: 'توضیحات اختیاری، شماره بچ یا نکات ایمنی...',
    createTaskBtn: 'ثبت تسک برای آبجکت',
    directionLabel: 'جهت حرکت',
    dirSendFromHere: 'ارسال از این مکان',
    dirBringHere: 'انتقال به این مکان',
    dispatchMissionBtn: 'اعزام مأموریت',
    mesWindowTypeLabel: 'نوع پنجره عملیاتی',
    mesTypePm: 'نگهداری پیشگیرانه (PM)',
    mesTypeCal: 'کالیبراسیون ابزار دقیق',
    mesTypeRun: 'اجرای تولید بچ',
    blocksDispatchLabel: 'مسدودسازی اعزام ناوگان در طول پنجره',
    activateImmediatelyLabel: 'فعال‌سازی بلافاصله',
    createMesWindowBtn: 'ثبت پنجره در خط تولید',
    startTaskBtn: 'شروع',
    completeTaskBtn: 'تکمیل',
    cancelTaskBtn: 'لغو',
    quickReleaseBtn: 'آزادسازی کیفیت',
    quickQuarantineBtn: 'انتقال به قرنطینه',
    activateBtn: 'فعال‌سازی',
    clearBtn: 'اتمام / پاک‌سازی',
    startImmediatelyLabel: 'شروع فوری عملیات روی دستگاه پس از ثبت',
    activeProcessBadge: 'در حال پردازش',
    autoOpsLabel: 'عملیات خودکار کارخانه',
    autoOpsActive: 'اجرای خودکار فعال',
    autoOpsPaused: 'اجرای خودکار متوقف',
    pauseAutoOps: 'توقف خودکار',
    resumeAutoOps: 'ادامه خودکار',
    simSpeedLabel: 'سرعت',
    activeFleetKpi: 'ناوگان فعال',
    completedMovesKpi: 'انتقال موفق',
    avgOeeKpi: 'میانگین OEE',
    activeTasksKpi: 'تسک فعال',
    liveFleetTracker: 'تله‌متری زنده ناوگان',
    routeProgressLabel: 'پیشرفت مسیر',
    idleParked: 'آماده در ایستگاه',
    enRouteTo: 'در مسیر ←',
    cpTabSafety: 'ایمنی و عملگر',
    cpTabFlags: 'پرچم‌های قابلیت',
    cpTabDispatch: 'تخصیص و ترافیک',
    cpTabRouting: 'مسیریابی و حدود',
    cpSafetyDesc: 'مدیریت اینترلاک ایمنی عملگر فیزیکی و سیاست تأیید دوگانه',
    cpFlagsDesc: 'فعال‌سازی یا تعلیق لحظه‌ای ماژول‌های عملیاتی در سطح سایت',
    cpDispatchDesc: 'تنظیم ضرایب امتیازدهی خودرو، سقف صف و سیاست‌های تقاطع',
    cpRoutingDesc: 'تنظیم هزینه مسیریاب هوشمند، آستانه انحراف و الگوی پیش‌فرض',
    dockGroupOps: 'عملیات صحن',
    dockGroupSys: 'کنترل سامانه',
    layersPanelTitle: 'لایه‌های سه‌بعدی',
    reasonLabel: 'دلیل تغییر',
  },
};

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
  isRtl: boolean;
  t: (key: string) => string;
  num: (v: string | number) => string;
  formatId: (id: string) => string;
  labelVehicle: (id: string, fallbackName?: string) => string;
  labelVehicleType: (type: string) => string;
  labelLocationCode: (codeOrId: string) => string;
  labelLocationName: (codeOrId: string, fallback?: string) => string;
  labelZone: (zoneId: string) => string;
  labelGrade: (grade: string) => string;
  labelEdge: (edgeId: string) => string;
  labelActor: (actorId: string, role?: string) => string;
  labelActorIdOnly: (actorId: string) => string;
  labelAssetCode: (assetId: string) => string;
  labelAssetName: (assetId: string, fallback?: string) => string;
  labelPalletCode: (palletId: string) => string;
  labelPalletName: (palletId: string, fallback?: string) => string;
  labelSkuDesc: (sku: string, fallback?: string) => string;
  labelUom: (uom: string) => string;
  labelLot: (lot: string) => string;
  labelSerial: (serial: string) => string;
  labelBom: (bomId: string, wo: string, prod: string) => { title: string; lotLabel: string };
  labelMaintenance: (mwId: string) => string;
  labelOpportunity: (opId: string, fallbackTitle: string, fallbackRationale: string) => { title: string; rationale: string };
  labelMissionState: (state: string) => string;
  labelVehicleStatus: (status: string, eStop?: boolean, isStale?: boolean) => string;
  labelQaStatus: (qa: string) => string;
  labelMachineState: (st: string) => string;
  labelCalibrationStatus: (st: string) => string;
  labelFlowKind: (kind: string) => string;
  labelFlowStatus: (status: string) => string;
  labelHandoffState: (st: string) => string;
  labelAttachmentState: (st: string) => string;
  labelActuationMode: (mode: string) => string;
  labelCostProfile: (cp: string) => string;
  labelIntersectionPolicy: (p: string) => string;
  labelDeadlockPolicy: (p: string) => string;
  labelFlag: (flag: string) => string;
  labelTopic: (topic: string) => string;
  labelErrorCode: (code: string) => string;
  labelSite: (siteId: string) => string;
  labelWorldRev: (rev: string) => string;
  labelRejection: (reason: string) => string;
  labelTaskCategory: (cat: string) => string;
  labelTaskPriority: (prio: string) => string;
  labelTaskStatus: (st: string) => string;
  translateNotice: (msg: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem('gradian_twin_lang');
      return saved === 'en' ? 'en' : 'fa';
    } catch {
      return 'fa';
    }
  });

  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('gradian_twin_theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('gradian_twin_lang', lang);
      localStorage.setItem('gradian_twin_theme', theme);
    } catch {
      // ignore storage errors
    }
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === 'fa' ? 'rtl' : 'ltr';
    html.classList.toggle('dark', theme === 'dark');
    document.title =
      lang === 'fa'
        ? 'دوقلوی دیجیتال گرادیان — عملیات فاز ۲'
        : 'Gradian Digital Twin — P2 Operations';
  }, [lang, theme]);

  const value = useMemo<I18nContextValue>(() => {
    const isFa = lang === 'fa';
    const num = (v: string | number) => (isFa ? toPersianDigits(v) : String(v));

    const formatId = (id: string) => {
      if (!isFa) return id;
      if (id.startsWith('MSN-')) return `مأموریت-${toPersianDigits(id.slice(4))}`;
      if (id.startsWith('CTN-')) return `کارتن-${toPersianDigits(id.slice(4))}`;
      if (id.startsWith('ITM-')) return `قلم-${toPersianDigits(id.slice(4))}`;
      if (id.startsWith('BATCH-')) return `بچ-${toPersianDigits(id.slice(6))}`;
      if (id.startsWith('res_')) return `رزرو-${toPersianDigits(id.slice(4))}`;
      return toPersianDigits(id);
    };

    const t = (key: string) => STRINGS[lang][key] ?? key;

    const labelVehicle = (id: string, fallbackName?: string) => {
      if (!isFa) return fallbackName ? `${id} · ${fallbackName}` : id;
      return VEHICLE_FA[id]?.short ?? toPersianDigits(fallbackName || id);
    };

    const labelVehicleType = (type: string) => {
      if (!isFa) return type;
      if (type === 'AMR') return 'ربات خودران';
      if (type === 'AGV') return 'حامل پالت';
      if (type === 'Forklift') return 'لیفتراک';
      return type;
    };

    const labelLocationCode = (codeOrId: string) => {
      if (!isFa) return codeOrId;
      return LOCATION_FA[codeOrId]?.code ?? toPersianDigits(codeOrId);
    };

    const labelLocationName = (codeOrId: string, fallback?: string) => {
      if (!isFa) return fallback || codeOrId;
      return LOCATION_FA[codeOrId]?.name ?? fallback ?? toPersianDigits(codeOrId);
    };

    const labelZone = (zoneId: string) => (isFa ? ZONE_FA[zoneId] ?? toPersianDigits(zoneId) : zoneId);
    const labelGrade = (grade: string) => (isFa ? GRADE_FA[grade] ?? grade : grade);
    const labelEdge = (edgeId: string) => {
      if (!isFa) return edgeId;
      if (EDGE_FA[edgeId]) return EDGE_FA[edgeId];
      return `مسیر ${toPersianDigits(edgeId.replace(/^(LANE-|EDGE-)/, ''))}`;
    };

    const labelActor = (actorId: string, role?: string) => {
      if (!isFa) return role ? `${actorId} (${role})` : actorId;
      const entry = ACTOR_FA[actorId];
      return entry ? `${entry.name} (${entry.role})` : toPersianDigits(actorId);
    };

    const labelActorIdOnly = (actorId: string) => {
      if (!isFa) return actorId;
      return ACTOR_FA[actorId]?.name ?? toPersianDigits(actorId);
    };

    const labelAssetCode = (assetId: string) =>
      isFa ? ASSET_FA[assetId]?.code ?? toPersianDigits(assetId) : assetId;

    const labelAssetName = (assetId: string, fallback?: string) =>
      isFa ? ASSET_FA[assetId]?.name ?? fallback ?? toPersianDigits(assetId) : fallback || assetId;

    const labelPalletCode = (palletId: string) =>
      isFa ? PALLET_FA[palletId]?.code ?? toPersianDigits(palletId) : palletId;

    const labelPalletName = (palletId: string, fallback?: string) =>
      isFa ? PALLET_FA[palletId]?.label ?? fallback ?? toPersianDigits(palletId) : fallback || palletId;

    const labelSkuDesc = (sku: string, fallback?: string) =>
      isFa ? SKU_ITEM_FA[sku] ?? fallback ?? sku : fallback || sku;

    const labelUom = (uom: string) => {
      if (!isFa) return uom;
      if (uom === 'KG') return 'کیلوگرم';
      if (uom === 'EA') return 'عدد';
      if (uom === 'BOX') return 'جعبه';
      return uom;
    };

    const labelLot = (lot: string) => {
      if (!isFa) return lot;
      return toPersianDigits(
        lot
          .replace('LOT-API-', 'بچ-مؤثره-')
          .replace('LOT-EXC-', 'بچ-جانبی-')
          .replace('LOT-PKG-', 'بچ-بسته‌بندی-')
          .replace('BATCH-', 'بچ-')
          .replace('-A', '-الف')
      );
    };

    const labelSerial = (serial: string) =>
      isFa ? toPersianDigits(serial.replace('SN-', 'سریال-')) : serial;

    const labelBom = (bomId: string, wo: string, prod: string) => {
      if (!isFa) return { title: `${wo} · ${prod}`, lotLabel: '' };
      const b = BOM_FA[bomId];
      return {
        title: b ? `${b.wo} · ${b.product}` : `${toPersianDigits(wo)} · ${prod}`,
        lotLabel: '',
      };
    };

    const labelMaintenance = (mwId: string) =>
      isFa ? MAINTENANCE_FA[mwId] ?? toPersianDigits(mwId) : mwId;

    const labelOpportunity = (opId: string, fallbackTitle: string, fallbackRationale: string) => {
      if (!isFa) return { title: fallbackTitle, rationale: fallbackRationale };
      return OPPORTUNITY_FA[opId] ?? { title: fallbackTitle, rationale: fallbackRationale };
    };

    const labelMissionState = (state: string) => {
      if (!isFa) return state.toUpperCase();
      const map: Record<string, string> = {
        requested: 'درخواست‌شده',
        planned: 'برنامه‌ریزی‌شده',
        executing: 'در حال اجرا',
        paused: 'متوقف موقت',
        completed: 'تکمیل‌شده',
        failed: 'ناموفق / توقف ایمن',
      };
      return map[state] ?? state;
    };

    const labelVehicleStatus = (status: string, eStop?: boolean, isStale?: boolean) => {
      if (eStop) return isFa ? 'توقف اضطراری' : 'E-STOP';
      if (isStale) return isFa ? 'تله‌متری منقضی' : 'STALE';
      if (!isFa) return status.toUpperCase();
      const map: Record<string, string> = {
        idle: 'آماده به کار',
        busy: 'در حال مأموریت',
        paused: 'متوقف موقت',
        e_stopped: 'توقف اضطراری',
        stale: 'تله‌متری منقضی',
      };
      return map[status] ?? status;
    };

    const labelQaStatus = (qa: string) => {
      if (!isFa) return qa;
      if (qa === 'released') return 'آزادشده';
      if (qa === 'quarantine') return 'قرنطینه';
      if (qa === 'hold') return 'نگه‌داشت بررسی';
      return qa;
    };

    const labelMachineState = (st: string) => {
      if (!isFa) return st.toUpperCase();
      if (st === 'run') return 'در حال کار';
      if (st === 'idle') return 'آماده';
      if (st === 'down') return 'متوقف / خرابی';
      if (st === 'maintenance') return 'در حال تعمیرات';
      return st;
    };

    const labelCalibrationStatus = (st: string) => {
      if (!isFa) return st;
      if (st === 'calibrated') return 'کالیبره و معتبر';
      if (st === 'due_soon') return 'نزدیک موعد کالیبراسیون';
      if (st === 'expired') return 'کالیبراسیون منقضی';
      return st;
    };

    const labelFlowKind = (kind: string) => {
      if (!isFa) return kind.replace('_', ' ');
      const map: Record<string, string> = {
        inbound_putaway: 'جایگذاری ورودی در قفسه',
        inbound_receiving: 'دریافت ورودی اسکله',
        outbound_staging: 'آماده‌سازی خروج کالا',
        outbound_picking: 'برداشت سفارش خروج',
        outbound_loading: 'بارگیری خروجی',
      };
      return map[kind] ?? kind;
    };

    const labelFlowStatus = (status: string) => {
      if (!isFa) return status;
      const map: Record<string, string> = {
        completed: 'تکمیل‌شده',
        blocked_qa: 'مسدود کنترل کیفیت',
        in_progress: 'در جریان',
        pending: 'در انتظار',
      };
      return map[status] ?? status;
    };

    const labelHandoffState = (st: string) => {
      if (!isFa) return st;
      if (st === 'pending') return 'در انتظار اعزام';
      if (st === 'in_transit') return 'در مسیر انتقال';
      if (st === 'handed_off') return 'تحویل‌شده به خط';
      return st;
    };

    const labelAttachmentState = (st: string) => {
      if (!isFa) return st;
      if (st === 'in_transit') return 'در حال حمل';
      if (st === 'attached') return 'متصل';
      if (st === 'detached') return 'تحویل‌داده‌شده';
      return st;
    };

    const labelActuationMode = (mode: string) => {
      if (!isFa) return mode.toUpperCase();
      if (mode === 'twin_only') return 'فقط دوقلو (شبیه‌سازی)';
      if (mode === 'shadow') return 'حالت سایه';
      if (mode === 'physical') return 'عملگر فیزیکی';
      return mode;
    };

    const labelCostProfile = (cp: string) => {
      if (!isFa) return cp.charAt(0).toUpperCase() + cp.slice(1);
      if (cp === 'fastest') return 'سریع‌ترین مسیر';
      if (cp === 'safest') return 'ایمن‌ترین مسیر';
      if (cp === 'shortest') return 'کوتاه‌ترین مسیر';
      return cp;
    };

    const labelIntersectionPolicy = (p: string) => {
      if (!isFa) return p;
      if (p === 'wait') return 'توقف و انتظار (wait)';
      if (p === 'yield') return 'تقدم‌دهی هوشمند (yield)';
      if (p === 'replan') return 'بازطراحی مسیر (replan)';
      return p;
    };

    const labelDeadlockPolicy = (p: string) => {
      if (!isFa) return p;
      if (p === 'replan_lowest_priority') return 'بازطراحی کم‌اولویت‌ترین خودرو';
      if (p === 'pause_all_and_alert') return 'توقف همگانی و ارسال هشدار';
      if (p === 'fail_mission') return 'لغو ایمن مأموریت متعارض';
      return p;
    };

    const labelFlag = (flag: string) => (isFa ? FLAG_FA[flag] ?? flag : flag.replace('dt.', ''));
    const labelTopic = (topic: string) => (isFa ? TOPIC_FA[topic] ?? topic : topic);
    const labelErrorCode = (code: string) => (isFa ? ERROR_CODE_FA[code] ?? code : code);
    const labelSite = (siteId: string) =>
      isFa && siteId === 'site-teh-01' ? 'مجتمع بیوفارما تهران — سایت ۰۱' : siteId;
    const labelWorldRev = (rev: string) =>
      isFa ? `نسخه نقشه ${toPersianDigits(rev.replace('rev-', ''))}` : rev;

    const labelRejection = (reason: string) => {
      if (!isFa) return reason;
      if (reason.includes('E-Stop')) return 'توقف اضطراری فعال است';
      if (reason.includes('Telemetry stale')) return 'تله‌متری خودرو منقضی شده است';
      if (reason.includes('Not qualified')) return 'عدم مجوز کلاس تمیزی مقصد';
      if (reason.includes('exceeds max')) return 'وزن بار بیش از ظرفیت مجاز خودرو است';
      if (reason.includes('minBatteryPct')) return 'شارژ باتری کمتر از حداقل مجاز است';
      if (reason.includes('maxQueueDepthPerVehicle')) return 'سقف صف مأموریت خودرو تکمیل است';
      return toPersianDigits(reason);
    };

    const translateNotice = (msg: string) => {
      if (!isFa) return msg;
      if (msg.startsWith('Dry-run route planned')) return 'آزمایش مسیریابی با موفقیت انجام شد و مسیر در نمای سه‌بعدی شبیه‌سازی گردید.';
      if (msg.startsWith('Idempotent replay')) return 'درخواست تکراری با کلید یکتا شناسایی شد؛ مأموریت قبلی بازگردانده شد.';
      if (msg.startsWith('Mission ') && msg.includes('dispatched to')) return 'مأموریت جابه‌جایی با موفقیت به خودروی منتخب اعزام شد.';
      if (msg.startsWith('Lane ')) return msg.includes('closed') ? 'مسیر انتخابی مسدود شد و بازطراحی پویای مسیرها فعال گردید.' : 'مسیر انتخابی مجدداً بازگشایی شد.';
      if (msg.startsWith('Vehicle ')) return 'فرمان کنترلی روی خودرو با موفقیت اعمال شد.';
      if (msg.includes('cancelled with safe stop')) return 'مأموریت با توقف ایمن لغو گردید.';
      if (msg.startsWith('Pallet ') && msg.includes('QA state')) return 'وضعیت کنترل کیفیت پالت به‌روزرسانی شد.';
      if (msg.startsWith('BOM ') && msg.includes('handoff')) return 'مأموریت تحویل مواد برای سفارش ساخت اعزام شد.';
      if (msg.startsWith('Asset ')) return 'وضعیت دستگاه تولیدی به‌روزرسانی شد.';
      if (msg.startsWith('Maintenance window')) return 'وضعیت پنجره تعمیر و نگهداری به‌روزرسانی شد.';
      if (msg.startsWith('Control Plane configuration')) return 'تنظیمات کنترل‌پلین سامانه ذخیره و اعمال شد.';
      if (msg.startsWith('Feature flags updated')) return 'وضعیت پرچم‌های قابلیت سایت به‌روزرسانی شد.';
      if (msg.startsWith('Actuation mode changed')) return 'حالت ایمنی عملگر سامانه با موفقیت تغییر یافت.';
      if (msg.includes('manual override')) return 'مداخله دستی اپراتور روی مأموریت اعمال شد.';
      if (msg.includes('manually released')) return 'رزرو زمانی مسیر به‌صورت دستی آزاد شد.';
      if (msg.startsWith('Task created')) return 'تسک جدید با موفقیت برای آبجکت انتخابی ثبت شد.';
      if (msg.startsWith('Task ') && msg.includes('updated')) return 'وضعیت تسک با موفقیت به‌روزرسانی شد.';
      if (msg.startsWith('Maintenance window created')) return 'پنجره عملیاتی جدید در سیستم تولید (MES) ثبت شد.';
      if (msg.startsWith('Autopilot autonomous factory resumed')) return 'چرخه عملیات خودکار کارخانه فعال شد.';
      if (msg.startsWith('Autopilot autonomous factory paused')) return 'چرخه عملیات خودکار کارخانه موقتاً متوقف شد.';
      if (msg.startsWith('Autopilot speed set')) return 'سرعت شبیه‌سازی عملیات خودکار تغییر یافت.';
      return toPersianDigits(msg);
    };

    const labelTaskCategory = (cat: string) => {
      if (!isFa) {
        const enMap: Record<string, string> = {
          inspection: 'Inspection',
          maintenance: 'Maintenance',
          qa_sampling: 'QA Sampling',
          sanitation: 'Sanitation',
          cycle_count: 'Cycle Count',
          charging: 'Charging',
          material_prep: 'Material Prep',
        };
        return enMap[cat] ?? cat;
      }
      const faMap: Record<string, string> = {
        inspection: 'بازرسی فنی',
        maintenance: 'تعمیر و نگهداری',
        qa_sampling: 'نمونه‌برداری کیفیت',
        sanitation: 'ضدعفونی و پاک‌سازی',
        cycle_count: 'شمارش و کنترل موجودی',
        charging: 'شارژ و آماده‌سازی',
        material_prep: 'تأمین و آماده‌سازی مواد',
      };
      return faMap[cat] ?? cat;
    };

    const labelTaskPriority = (prio: string) => {
      if (!isFa) return prio.toUpperCase();
      const faMap: Record<string, string> = {
        low: 'کم',
        medium: 'متوسط',
        high: 'بالا',
        critical: 'بحرانی',
      };
      return faMap[prio] ?? prio;
    };

    const labelTaskStatus = (st: string) => {
      if (!isFa) return st.replace('_', ' ').toUpperCase();
      const faMap: Record<string, string> = {
        pending: 'در انتظار',
        in_progress: 'در حال انجام',
        completed: 'تکمیل‌شده',
        cancelled: 'لغوشده',
      };
      return faMap[st] ?? st;
    };

    return {
      lang,
      setLang,
      toggleLang: () => setLang((prev) => (prev === 'fa' ? 'en' : 'fa')),
      theme,
      setTheme,
      toggleTheme: () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark')),
      isRtl: isFa,
      t,
      num,
      formatId,
      labelVehicle,
      labelVehicleType,
      labelLocationCode,
      labelLocationName,
      labelZone,
      labelGrade,
      labelEdge,
      labelActor,
      labelActorIdOnly,
      labelAssetCode,
      labelAssetName,
      labelPalletCode,
      labelPalletName,
      labelSkuDesc,
      labelUom,
      labelLot,
      labelSerial,
      labelBom,
      labelMaintenance,
      labelOpportunity,
      labelMissionState,
      labelVehicleStatus,
      labelQaStatus,
      labelMachineState,
      labelCalibrationStatus,
      labelFlowKind,
      labelFlowStatus,
      labelHandoffState,
      labelAttachmentState,
      labelActuationMode,
      labelCostProfile,
      labelIntersectionPolicy,
      labelDeadlockPolicy,
      labelFlag,
      labelTopic,
      labelErrorCode,
      labelSite,
      labelWorldRev,
      labelRejection,
      labelTaskCategory,
      labelTaskPriority,
      labelTaskStatus,
      translateNotice,
    };
  }, [lang, theme]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return ctx;
}
