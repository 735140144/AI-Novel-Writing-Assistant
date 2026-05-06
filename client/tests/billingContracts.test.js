import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const billingManagementPageSource = readFileSync("client/src/pages/settings/BillingManagementPage.tsx", "utf8");

test("billing management page uses stable empty query fallbacks to avoid render loops before data arrives", () => {
  assert.match(billingManagementPageSource, /const EMPTY_MODEL_PRICES:/);
  assert.match(billingManagementPageSource, /const EMPTY_PACKAGE_TEMPLATES:/);
  assert.match(billingManagementPageSource, /const EMPTY_REDEEM_CODES:/);
  assert.match(billingManagementPageSource, /const modelPrices = modelPricesQuery\.data\?\.data \?\? EMPTY_MODEL_PRICES/);
  assert.match(billingManagementPageSource, /const packageTemplates = packageTemplatesQuery\.data\?\.data \?\? EMPTY_PACKAGE_TEMPLATES/);
  assert.match(billingManagementPageSource, /const redeemCodes = redeemCodesQuery\.data\?\.data \?\? EMPTY_REDEEM_CODES/);
  assert.doesNotMatch(billingManagementPageSource, /const modelPrices = modelPricesQuery\.data\?\.data \?\? \[\]/);
  assert.doesNotMatch(billingManagementPageSource, /const packageTemplates = packageTemplatesQuery\.data\?\.data \?\? \[\]/);
  assert.doesNotMatch(billingManagementPageSource, /const redeemCodes = redeemCodesQuery\.data\?\.data \?\? \[\]/);
});

test("billing management page adds model prices from enabled configured provider models", () => {
  assert.match(billingManagementPageSource, /getAPIKeySettings/);
  assert.match(billingManagementPageSource, /enabledProviderOptions/);
  assert.match(billingManagementPageSource, /provider\.isActive && provider\.isConfigured/);
  assert.match(billingManagementPageSource, /currentModel/);
  assert.match(billingManagementPageSource, /新增模型价格/);
  assert.match(billingManagementPageSource, /请选择已启用供应商/);
  assert.doesNotMatch(billingManagementPageSource, /<Input[^>]+value=\{newModelPriceForm\.provider\}/);
  assert.doesNotMatch(billingManagementPageSource, /<Input[^>]+value=\{newModelPriceForm\.model\}/);
});
