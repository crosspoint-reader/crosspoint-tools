// Every device CrossPoint supports: the flasher's picker and /api/devices (which
// the CrossPoint Sync app reads for wallpaper and EPUB sizes) both come from here.
// board = the BoardConfig name the reader reports in /api/status (Xteink X4/X3
// builds report "X4"/"X3", which match the id).
export const DEVICES = [
  { id: 'x4', name: 'Xteink X4', width: 480, height: 800, board: 'xteink_x4' },
  { id: 'x4pro', name: 'Xteink X4 Pro', width: 480, height: 800, board: 'xteink_x4_pro' },
  { id: 'x4c', name: 'Xteink X4C', width: 480, height: 800, board: 'xteink_x4_classic' },
  { id: 'x3', name: 'Xteink X3', width: 528, height: 792, board: 'xteink_x3' },
  { id: 'sticky', name: 'Seeed Sticky', width: 480, height: 800, board: 'sticky' },
  { id: 'm5paper', name: 'M5Paper v1.1', width: 540, height: 960, board: 'm5paper_v11' },
  { id: 'm5papers3', name: 'M5Paper S3', width: 540, height: 960, board: 'm5paper_s3' },
  { id: 'papermono', name: 'M5PaperMono', width: 480, height: 800, board: 'm5stack_paper_mono' },
  { id: 'lilygo', name: 'LilyGo T5', width: 540, height: 960, board: 'lilygo_t5s3' },
  { id: 'metalio', name: 'Metalio E-INK4', width: 480, height: 800, board: 'metalio_eink4' },
  { id: 'metalio_plus', name: 'Metalio E-INK4 Plus', width: 684, height: 1216, board: 'metalio_eink4_plus' },
  { id: 'eego_a4', name: 'EEGO Reader A4', width: 552, height: 768, board: 'eego_a4' },
  { id: 'picco', name: 'BOOX Picco', width: 480, height: 800, board: 'picco' },
]
