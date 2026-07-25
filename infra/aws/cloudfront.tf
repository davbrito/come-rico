# ---------------------------------------------------------------------------
# CloudFront — the single public entry point, replacing what vercel.json's
# `rewrites` used to do (path-based routing to the two services on one
# origin). This is what keeps frontend + backend same-origin so the
# `__Host-`-prefixed auth cookie keeps working with no CORS changes.
#
# CloudFront's data-transfer-out and request allowances are part of AWS's
# permanent Always Free tier (1TB/mo, 10M requests/mo, no 12-month expiry),
# same reasoning as choosing Function URLs over API Gateway.
# ---------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "backend" {
  name                              = "${var.project_name}-backend"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project_name}-frontend"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_origin_access_control" "static_assets" {
  name                              = "${var.project_name}-static-assets"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Managed policies (no caching for SSR/API since responses depend on the
# auth cookie; forward cookies/headers to both Lambda origins).
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "main" {
  enabled = true

  origin {
    domain_name              = trimsuffix(trimprefix(aws_lambda_function_url.backend.function_url, "https://"), "/")
    origin_id                = "backend-lambda"
    origin_access_control_id = aws_cloudfront_origin_access_control.backend.id

    custom_origin_config {
      http_port              = 443
      https_port              = 443
      origin_protocol_policy  = "https-only"
      origin_ssl_protocols    = ["TLSv1.2"]
    }
  }

  origin {
    domain_name              = trimsuffix(trimprefix(aws_lambda_function_url.frontend.function_url, "https://"), "/")
    origin_id                = "frontend-lambda"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id

    custom_origin_config {
      http_port               = 443
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
    }
  }

  origin {
    domain_name              = aws_s3_bucket.static_assets.bucket_regional_domain_name
    origin_id                = "static-assets-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.static_assets.id
  }

  default_cache_behavior {
    target_origin_id       = "frontend-lambda"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods         = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  ordered_cache_behavior {
    path_pattern            = "/api/*"
    target_origin_id        = "backend-lambda"
    viewer_protocol_policy  = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods            = ["GET", "HEAD"]
    cache_policy_id           = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id  = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  # Vite/Rollup emits content-hashed filenames under /assets/**, and Nitro
  # already sets a long immutable Cache-Control on them (see nitro route
  # rules) — CachingOptimized (which respects origin Cache-Control) is a
  # good fit rather than a hardcoded CloudFront TTL.
  ordered_cache_behavior {
    path_pattern            = "/assets/*"
    target_origin_id        = "static-assets-s3"
    viewer_protocol_policy  = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD"]
    cached_methods            = ["GET", "HEAD"]
    cache_policy_id           = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# ---- Grant CloudFront (via OAC) permission to invoke each Function URL ----

resource "aws_lambda_permission" "cloudfront_invoke_backend" {
  statement_id  = "AllowCloudFrontInvoke"
  action        = "lambda:InvokeFunctionUrl"
  function_name = aws_lambda_function.backend.function_name
  principal     = "cloudfront.amazonaws.com"
  source_arn    = aws_cloudfront_distribution.main.arn
}

resource "aws_lambda_permission" "cloudfront_invoke_frontend" {
  statement_id  = "AllowCloudFrontInvoke"
  action        = "lambda:InvokeFunctionUrl"
  function_name = aws_lambda_function.frontend.function_name
  principal     = "cloudfront.amazonaws.com"
  source_arn    = aws_cloudfront_distribution.main.arn
}

# ---- Grant CloudFront (via OAC) permission to read the static assets bucket ----

data "aws_iam_policy_document" "static_assets_cloudfront_read" {
  statement {
    sid       = "AllowCloudFrontServicePrincipalReadOnly"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.static_assets.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.main.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "static_assets" {
  bucket = aws_s3_bucket.static_assets.id
  policy = data.aws_iam_policy_document.static_assets_cloudfront_read.json
}
