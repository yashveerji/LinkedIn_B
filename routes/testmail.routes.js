import { Router } from 'express';
import { fetchInbox, testmailAddress } from '../service/testmail.service.js';

const router = Router();

function guard(req, res, next) {
  // Only allow in non-production unless explicitly enabled
  const isProd = (process.env.NODE_ENV === 'production' || process.env.NODE_ENVIRONMENT === 'production');
  if (process.env.ENABLE_TESTMAIL_API === 'true' || !isProd) {
    return next();
  }
  return res.status(403).json({ message: 'Testmail API disabled in production' });
}

router.get('/address', guard, (req, res) => {
  const { tag = 'default' } = req.query;
  try {
    const address = testmailAddress(tag);
    res.json({ address });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/inbox', guard, async (req, res) => {
  try {
    const data = await fetchInbox({
      tag: req.query.tag,
      tag_prefix: req.query.tag_prefix,
      timestamp_from: req.query.timestamp_from,
      timestamp_to: req.query.timestamp_to,
      limit: req.query.limit,
      offset: req.query.offset,
      livequery: req.query.livequery,
      headers: req.query.headers,
      spam_report: req.query.spam_report,
    });
  
    res.json(data);
  } catch (e) {
    res.status(500).json({ result: 'fail', message: e.message });
  }
});

export default router;
