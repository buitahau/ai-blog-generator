function toDetails(issues) {
  return issues.flatMap((issue) => {
    // Unknown keys are reported on the parent path; name each offending key instead.
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        path: [...issue.path, key].join('.'),
        message: `Unknown field "${key}".`,
      }));
    }
    return [{ path: issue.path.join('.') || 'body', message: issue.message }];
  });
}

export function validate(schema) {
  return (req, res, next) => {
    // express.json() leaves req.body undefined when no body was sent.
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          details: toDetails(result.error.issues),
        },
      });
    }
    req.body = result.data;
    next();
  };
}

// Shared by validateQuery/validateParams. Parsed values go on res.locals because Express 5's
// req.query is getter-only and Express resets req.params for each layer.
function validateSource(source, schema, target) {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          details: toDetails(result.error.issues).map((d) => ({
            ...d,
            path: d.path === 'body' ? source : d.path,
          })),
        },
      });
    }
    res.locals[target] = result.data;
    next();
  };
}

export const validateQuery = (schema) => validateSource('query', schema, 'query');
export const validateParams = (schema) => validateSource('params', schema, 'params');
