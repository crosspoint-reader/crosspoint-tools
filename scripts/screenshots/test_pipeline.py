import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image, ImageDraw

import pipeline


class PipelineTest(unittest.TestCase):
    def test_polish_preserves_geometry_palette_and_adds_smooth_edges(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'test.bmp'
            image = Image.new('1', (480, 800), 1)
            ImageDraw.Draw(image).polygon([(60, 60), (400, 600), (60, 600)], fill=0)
            image.save(source)
            result = pipeline.polish(source, (480, 800))
            self.assertEqual(result.size, (1440, 2400))
            self.assertEqual(result.getpixel((0, 0)), (244, 241, 233))
            self.assertEqual(result.getpixel((200, 1000)), (36, 40, 32))
            self.assertGreater(len(result.getcolors()), 100)
            with self.assertRaisesRegex(ValueError, 'aspect ratio'):
                pipeline.polish(source, (800, 480))

    def test_capture_isolates_sd_and_does_not_publish_books(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            books = root / 'library'
            books.mkdir()
            book = books / 'Test.epub'
            book.write_bytes(b'original')
            fonts = root / 'fonts'
            (fonts / 'Libron').mkdir(parents=True)
            font = fonts / 'Libron/Libron-Regular.ttf'
            font.write_bytes(b'original-font')
            (fonts / 'Libron/SOURCE.md').write_text('Font provenance')
            binary = root / 'program'
            binary.write_bytes(b'binary')
            recipe = {'books': ['Test.epub'], 'settings': {'fontSize': 14, 'screenMargin': 20}, 'scenes': [
                {'name': 'test', 'book': 'Test.epub', 'position': [8, 1], 'at': 2000, 'settings': {'fontSize': 18}, 'opdsServers': [{'name': 'Library', 'url': 'https://example.org/opds'}]}]}
            def simulator(command, **kwargs):
                sd = Path(kwargs['env']['CROSSPOINT_SIM_SD'])
                self.assertEqual(json.loads((sd / '.crosspoint/opds.json').read_text()),
                                 {'servers': [{'name': 'Library', 'url': 'https://example.org/opds'}]})
                self.assertEqual(json.loads((sd / '.crosspoint/settings.json').read_text())['fontSize'], 18)
                self.assertEqual(json.loads((sd / '.crosspoint/settings.json').read_text())['screenMargin'], 20)
                self.assertEqual(json.loads((sd / '.crosspoint/state.json').read_text())['openEpubPath'], '/books/Test.epub')
                (sd / 'books/Test.epub').write_bytes(b'changed by firmware')
                staged_font = sd / 'fonts/Libron/Libron-Regular.ttf'
                self.assertTrue(staged_font.is_file())
                self.assertFalse((sd / 'fonts/Libron/SOURCE.md').exists())
                staged_font.write_bytes(b'changed-copy')
                cache = sd / '.crosspoint/epub_123'
                if not kwargs['env']['CROSSPOINT_SIM_SCREENSHOTS']:
                    cache.mkdir()
                    (cache / 'book.bin').write_bytes(b'indexed')
                    return
                self.assertEqual((cache / 'progress.bin').read_bytes(), b'\x08\x00\x01\x00')
                path = kwargs['env']['CROSSPOINT_SIM_SCREENSHOTS'].split(':', 1)[1]
                image = Image.new('L', (480, 800), 255)
                ImageDraw.Draw(image).rectangle((20, 20, 200, 300), fill=0)
                image.save(path)
            with patch('pipeline.subprocess.run', side_effect=simulator):
                pipeline.capture(binary, books, recipe, root / 'output', fonts=fonts)
            self.assertEqual(book.read_bytes(), b'original')
            self.assertEqual(font.read_bytes(), b'original-font')
            manifest = json.loads((root / 'output/manifest.json').read_text())
            self.assertEqual(manifest['fonts']['Libron/Libron-Regular.ttf'], pipeline.digest(font))
            self.assertEqual(list((root / 'output').rglob('*.epub')), [])
            self.assertTrue((root / 'output/index.html').exists())
            self.assertTrue((root / 'output/manifest.json').exists())
            (root / 'public').mkdir()
            with patch('pipeline.ROOT', root):
                pipeline.publish(root / 'output')
                published = root / 'public/screenshots/test.png'
                before = published.read_bytes()
                (root / 'output/test.webp').write_bytes(b'corrupt')
                with self.assertRaisesRegex(ValueError, 'WebP changed'):
                    pipeline.publish(root / 'output')
                self.assertEqual(published.read_bytes(), before)

    def test_configured_book_folder_and_cli_override(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / 'settings.json'
            binary = root / 'program'
            binary.touch()
            recipe = {'books': ['Selected.epub'], 'fontsDirectory': 'custom-fonts', 'settings': {'fontSize': 16}, 'scenes': [
                {'name': 'selected', 'book': 'Selected.epub', 'at': 2000}]}
            cases = [
                (str(root / 'alternate'), [], (root / 'alternate').resolve(), '--config'),
                ('relative-books', [], (root / 'relative-books').resolve(), '--config'),
                ('~/Books/EPUBs', [], (Path.home() / 'Books/EPUBs').resolve(), '--config'),
                ('ignored', ['--books', 'cli-books'], (Path.cwd() / 'cli-books').resolve(), '--config'),
                (None, [], Path('/Users/jmitch/Books/Common Stacks'), '--recipe'),
            ]
            for folder, flags, expected, config_option in cases:
                with self.subTest(folder=folder, flags=flags):
                    configured = {**recipe, **({'booksDirectory': folder} if folder is not None else {})}
                    config.write_text(json.dumps(configured))
                    argv = ['pipeline.py', config_option, str(config), '--binary', str(binary), *flags]
                    with patch('sys.argv', argv), patch('pipeline.capture') as capture:
                        pipeline.main()
                    self.assertEqual(capture.call_args.args[1], expected)
                    self.assertEqual(capture.call_args.kwargs['fonts'], (root / 'custom-fonts').resolve())
                    self.assertEqual(capture.call_args.args[2]['scenes'][0]['book'], 'Selected.epub')
                    self.assertEqual(capture.call_args.args[2]['settings']['fontSize'], 16)

    def test_default_configuration_is_settings_json(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            binary = cache / 'firmware/.pio/build/simulator_x4_pro/program'
            binary.parent.mkdir(parents=True)
            binary.touch()
            with patch('pipeline.CACHE', cache), patch('sys.argv', ['pipeline.py']), patch('pipeline.capture') as capture:
                pipeline.main()
            self.assertEqual(capture.call_args.args[0], binary.resolve())
            self.assertEqual(capture.call_args.args[2], pipeline.read_recipe(pipeline.HERE / 'settings.json'))

    def test_rejects_traversal_duplicate_names_and_late_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'recipe.json'
            for recipe in [
                {'booksDirectory': '', 'books': [], 'scenes': []},
                {'booksDirectory': 42, 'books': [], 'scenes': []},
                {'books': ['../book.epub'], 'scenes': []},
                {'books': [], 'scenes': [{'name': '../outside', 'at': 2000}]},
                {'books': [], 'scenes': [{'name': 'test', 'at': 2000}] * 2},
                {'books': [], 'scenes': [{'name': 'test', 'at': 2000, 'inputs': [[3000, 'ENTER']]}]},
            ]:
                path.write_text(json.dumps(recipe))
                with self.assertRaises(ValueError):
                    pipeline.read_recipe(path)

    def test_rejects_invalid_opds_servers(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'recipe.json'
            for servers in (None, [{}], [{'name': '', 'url': 'https://example.org'}],
                            [{'name': 'Library', 'url': 'file:///tmp/catalog'}],
                            [{'name': 'Library', 'url': 'https://user:secret@example.org'}],
                            [{'name': 'Library', 'url': 'https://example.org'}] * 9):
                with self.subTest(servers=servers):
                    path.write_text(json.dumps({'books': [], 'scenes': [
                        {'name': 'home', 'at': 2000, 'opdsServers': servers}]}))
                    with self.assertRaises(ValueError):
                        pipeline.read_recipe(path)

    def test_regular_dither_is_smoothed_without_changing_paper(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'dither.bmp'
            image = Image.new('L', (480, 800), 255)
            for y in range(100, 300):
                for x in range(100, 300):
                    image.putpixel((x, y), 255 if (x + y) % 2 else 0)
            image.save(path)
            result = pipeline.polish(path, (480, 800)).convert('L')
            low, high = result.crop((400, 400, 700, 700)).getextrema()
            self.assertLess(high - low, 15)
            self.assertEqual(pipeline.polish(path, (480, 800)).getpixel((0, 0)), (244, 241, 233))

    def test_rejects_blank_capture(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'blank.bmp'
            Image.new('L', (480, 800), 255).save(path)
            with self.assertRaisesRegex(ValueError, 'blank'):
                pipeline.polish(path, (480, 800))


if __name__ == '__main__':
    unittest.main()
