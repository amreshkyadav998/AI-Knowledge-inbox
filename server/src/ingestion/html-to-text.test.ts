import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractFromHtml, htmlToText } from './html-to-text.js';
import { isPrivateAddress } from './url-fetcher.js';

describe('htmlToText', () => {
  it('drops script and style content', () => {
    const text = htmlToText('<p>Keep this</p><script>alert("no")</script><style>.a{color:red}</style>');
    assert.match(text, /Keep this/);
    assert.doesNotMatch(text, /alert|color:red/);
  });

  it('drops navigation chrome', () => {
    const text = htmlToText('<nav>Home About</nav><p>Article body</p><footer>Copyright</footer>');
    assert.equal(text, 'Article body');
  });

  it('keeps block structure as line breaks', () => {
    const text = htmlToText('<p>First</p><p>Second</p>');
    assert.match(text, /First\s*\n+\s*Second/);
  });

  it('decodes named and numeric entities', () => {
    assert.equal(htmlToText('<p>caf&#233; &amp; bar &mdash; open</p>'), 'café & bar - open');
  });

  it('ignores comments', () => {
    assert.equal(htmlToText('<p>Visible</p><!-- hidden note -->'), 'Visible');
  });
});

describe('extractFromHtml', () => {
  it('prefers the og:title meta tag', () => {
    const result = extractFromHtml(
      '<head><meta property="og:title" content="Social Title"><title>Tag Title</title></head><body><p>Body</p></body>',
    );
    assert.equal(result.title, 'Social Title');
  });

  it('falls back to the title tag, then the first h1', () => {
    assert.equal(extractFromHtml('<title>Tag Title</title><p>Body</p>').title, 'Tag Title');
    assert.equal(extractFromHtml('<h1>Heading</h1><p>Body</p>').title, 'Heading');
  });

  it('reports no title when the document has none', () => {
    assert.equal(extractFromHtml('<p>Body only</p>').title, null);
  });
});

describe('isPrivateAddress (SSRF guard)', () => {
  it('rejects loopback, RFC1918, link-local and CGNAT ranges', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata endpoint
      '100.64.0.1',
      '0.0.0.0',
    ]) {
      assert.equal(isPrivateAddress(address), true, `${address} should be blocked`);
    }
  });

  it('rejects the IPv6 equivalents, including IPv4-mapped loopback', () => {
    for (const address of ['::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1']) {
      assert.equal(isPrivateAddress(address), true, `${address} should be blocked`);
    }
  });

  it('allows ordinary public addresses', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34', '2606:4700::1']) {
      assert.equal(isPrivateAddress(address), false, `${address} should be allowed`);
    }
  });
});
