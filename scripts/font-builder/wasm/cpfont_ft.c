// FreeType shim for the browser-side .cpfont generator.
//
// Mirrors the glyph pipeline in scripts/font-builder/fontconvert_sdcard.py so
// both generators produce byte-identical output. The 4-bit intermediate buffer
// the Python version builds collapses to `coverage >> 4` once you follow the
// nibble packing/unpacking through (even pixels land in the low nibble and are
// read back with `>> 0`, odd pixels in the high nibble and read back with
// `>> 4`), so this renders straight from the 8-bit FreeType coverage value.
//
// Rasterizing and 2-bit packing happen here rather than in JS because a CJK
// build walks ~27k codepoints per size; one call per glyph keeps the
// JS/wasm boundary out of the inner loop.

#include <math.h>
#include <stdlib.h>
#include <string.h>

#include <ft2build.h>
#include FT_FREETYPE_H

#define MAX_FACES 32

static FT_Library g_library = NULL;
static FT_Face g_faces[MAX_FACES];
static unsigned char *g_data[MAX_FACES];

static FT_Face face_of(int id) {
  if (id < 0 || id >= MAX_FACES) return NULL;
  return g_faces[id];
}

int cp_init(void) {
  if (g_library) return 0;
  return FT_Init_FreeType(&g_library) ? -1 : 0;
}

// Takes ownership of `data` (malloc'd by the caller). FreeType reads from the
// buffer for the lifetime of the face, so it must stay alive until
// cp_face_free() — freeing it earlier gives garbage glyphs, not a clean error.
int cp_face_new(unsigned char *data, int len) {
  if (!g_library || !data || len <= 0) return -1;

  int slot = -1;
  for (int i = 0; i < MAX_FACES; i++) {
    if (!g_faces[i]) { slot = i; break; }
  }
  if (slot < 0) return -1;

  FT_Face face = NULL;
  if (FT_New_Memory_Face(g_library, data, (FT_Long)len, 0, &face)) return -2;

  g_faces[slot] = face;
  g_data[slot] = data;
  return slot;
}

void cp_face_free(int id) {
  FT_Face face = face_of(id);
  if (!face) return;
  FT_Done_Face(face);
  free(g_data[id]);
  g_faces[id] = NULL;
  g_data[id] = NULL;
}

// 150 DPI, matching fontconvert.py / fontconvert_sdcard.py. Must be called
// before any glyph load: FT_LOAD_RENDER renders at the active size.
int cp_face_set_size(int id, int point_size) {
  FT_Face face = face_of(id);
  if (!face) return -1;
  return FT_Set_Char_Size(face, point_size << 6, point_size << 6, 150, 150) ? -1 : 0;
}

// Writes 1 byte per codepoint in [start, end]: 1 when the face has a glyph.
// Bulk call so interval validation does not cross into wasm per codepoint.
int cp_coverage_range(int id, unsigned int start, unsigned int end, unsigned char *out) {
  FT_Face face = face_of(id);
  if (!face || end < start) return -1;
  for (unsigned int cp = start; cp <= end; cp++) {
    out[cp - start] = FT_Get_Char_Index(face, cp) > 0 ? 1 : 0;
  }
  return 0;
}

// out_info (int32): [0] width, [1] rows, [2] left, [3] top,
//                   [4] advance_x in 12.4 fixed-point, [5] packed byte length
// Returns 0 on success, 1 when the face has no glyph for `codepoint`,
// -1 on a bad face/args, -2 when out_cap is too small for the packed bitmap.
int cp_render_glyph(int id, unsigned int codepoint, int load_flags, int darken_aa,
                    int *out_info, unsigned char *out_bitmap, int out_cap) {
  FT_Face face = face_of(id);
  if (!face || !out_info) return -1;

  FT_UInt glyph_index = FT_Get_Char_Index(face, codepoint);
  if (glyph_index == 0) return 1;
  if (FT_Load_Glyph(face, glyph_index, load_flags)) return -1;

  FT_Bitmap *bitmap = &face->glyph->bitmap;
  const int width = (int)bitmap->width;
  const int rows = (int)bitmap->rows;
  const int abs_pitch = bitmap->pitch < 0 ? -bitmap->pitch : bitmap->pitch;

  // --darken-aa lowers the 2-bit thresholds so partially covered edge pixels
  // round up to a darker shade; without it self-built fonts render lighter
  // than the built-in reading fonts at the same nominal weight.
  const int t1 = darken_aa ? 3 : 4;
  const int t2 = darken_aa ? 6 : 8;
  const int t3 = darken_aa ? 10 : 12;

  const int total_pixels = width * rows;
  const int packed_len = (total_pixels + 3) / 4;
  if (packed_len > out_cap) return -2;

  int out_pos = 0;
  unsigned int px = 0;
  for (int y = 0; y < rows; y++) {
    // FreeType may hand back a bottom-up bitmap (negative pitch) or pad rows,
    // so walk by (row, col) using the real pitch instead of reading the buffer
    // linearly.
    const int row_offset = bitmap->pitch >= 0 ? y * abs_pitch : (rows - 1 - y) * abs_pitch;
    for (int x = 0; x < width; x++) {
      const int level = bitmap->buffer[row_offset + x] >> 4;
      px <<= 2;
      if (level >= t3) px += 3;
      else if (level >= t2) px += 2;
      else if (level >= t1) px += 1;

      if ((y * width + x) % 4 == 3) {
        out_bitmap[out_pos++] = (unsigned char)(px & 0xFF);
        px = 0;
      }
    }
  }
  if (total_pixels % 4 != 0) {
    px <<= (4 - (total_pixels % 4)) * 2;
    out_bitmap[out_pos++] = (unsigned char)(px & 0xFF);
  }

  out_info[0] = width;
  out_info[1] = rows;
  out_info[2] = face->glyph->bitmap_left;
  out_info[3] = face->glyph->bitmap_top;
  // 16.16 linearHoriAdvance -> 12.4 fixed-point, rounded.
  out_info[4] = (int)((face->glyph->linearHoriAdvance + (1 << 11)) >> 12);
  out_info[5] = out_pos;
  return 0;
}

// out (int32): [0] advanceY, [1] ascender, [2] descender — the scaled face
// metrics, taken from the primary face so line metrics stay stable even when
// fallback families contribute glyphs.
int cp_face_metrics(int id, int *out) {
  FT_Face face = face_of(id);
  if (!face || !out) return -1;
  FT_Size_Metrics m = face->size->metrics;
  out[0] = (int)ceil((double)m.height / 64.0);
  out[1] = (int)ceil((double)m.ascender / 64.0);
  out[2] = (int)floor((double)m.descender / 64.0);
  return 0;
}

// Batch codepoint -> glyph index. The kerning and ligature extractors need the
// same cmap the rasterizer uses, so they read it from FreeType rather than
// parsing cmap a second time in JS.
int cp_char_indices(int id, const unsigned int *codepoints, int count, int *out) {
  FT_Face face = face_of(id);
  if (!face) return -1;
  for (int i = 0; i < count; i++) {
    out[i] = (int)FT_Get_Char_Index(face, codepoints[i]);
  }
  return 0;
}

// Dumps the whole active charmap as [codepoint, glyph_index] pairs, ascending
// by codepoint. Returns the pair count, or -(pairs needed) when `cap` pairs is
// too small. Ligature extraction needs the full cmap, not just the requested
// codepoints, to resolve the output glyph of a ligature.
int cp_charmap_dump(int id, unsigned int *out, int cap) {
  FT_Face face = face_of(id);
  if (!face) return -1;

  FT_UInt glyph_index = 0;
  FT_ULong codepoint = FT_Get_First_Char(face, &glyph_index);
  int count = 0;
  while (glyph_index != 0) {
    if (count < cap) {
      out[count * 2] = (unsigned int)codepoint;
      out[count * 2 + 1] = glyph_index;
    }
    count++;
    codepoint = FT_Get_Next_Char(face, codepoint, &glyph_index);
  }
  return count <= cap ? count : -count;
}

