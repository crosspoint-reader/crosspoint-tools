from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

import generate


def user(index):
    return {'id': index, 'login': f'person-{index:03}', 'type': 'User',
            'avatar_url': f'https://avatars.githubusercontent.com/u/{index}',
            'html_url': f'https://github.com/person-{index:03}'}


class ContributorsTest(unittest.TestCase):
    def test_paginates_and_deduplicates_accounts(self):
        pages = [[user(i) for i in range(1, 101)], [user(100), user(101)]]
        with patch('generate.github_page', side_effect=pages) as fetch:
            users = generate.contributors('owner/repo')
        self.assertEqual(len(users), 101)
        self.assertEqual([call.args[1] for call in fetch.call_args_list], [1, 2])
        self.assertEqual(users[0]['login'], 'person-001')
        with patch('generate.github_page', return_value=[]):
            with self.assertRaisesRegex(ValueError, 'no contributors'):
                generate.contributors('owner/repo')

    def test_every_avatar_is_inside_canvas_and_rendered_once(self):
        for count in (1, 44, 242, 300):
            boxes = generate.positions(count)
            self.assertEqual(len(set(boxes)), count)
            for left, top, right, bottom in boxes:
                self.assertTrue(0 <= left < right <= generate.SIZE[0])
                self.assertTrue(0 <= top < bottom <= generate.SIZE[1])
        colors = [(i, 20, 90, 255) for i in range(44)]
        result = generate.collage([Image.new('RGBA', (64, 64), color) for color in colors])
        for color, (left, top, right, bottom) in zip(colors, generate.positions(44)):
            self.assertEqual(result.getpixel(((left + right) // 2, (top + bottom) // 2)), color[:3])

    def test_failed_avatar_does_not_replace_existing_output(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'collage.webp'
            output.write_bytes(b'previous-image')
            with patch('generate.contributors', return_value=[user(1)]), patch('generate.avatar', side_effect=OSError('offline')):
                with self.assertRaisesRegex(OSError, 'offline'):
                    generate.generate('owner/repo', output)
            self.assertEqual(output.read_bytes(), b'previous-image')
            self.assertFalse(output.with_suffix('.json').exists())


if __name__ == '__main__':
    unittest.main()
