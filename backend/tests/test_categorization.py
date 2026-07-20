import unittest

from app.services.categorization import build_merchant_groups, merchant_key


class CategorizationTests(unittest.TestCase):
    def test_merchant_key_groups_similar_descriptions(self):
        self.assertEqual(merchant_key("POS PURCHASE STARBUCKS #123 TORONTO"), "STARBUCKS")
        self.assertEqual(merchant_key("Debit Starbucks Toronto 456"), "STARBUCKS")

    def test_merchant_key_groups_store_number_location_patterns(self):
        self.assertEqual(merchant_key("LCBO/RAO #685 TORONTO, O"), "LCBO RAO")
        self.assertEqual(merchant_key("LCBO RAO #102 OTTAWA ON"), "LCBO RAO")
        self.assertEqual(merchant_key("LCBO/RAO #42 MISSISSAUGA ON"), "LCBO RAO")

    def test_merchant_key_groups_amazon_order_patterns(self):
        self.assertEqual(merchant_key("Amazon.ca*EL2Y62I33 866-216-1072, ON"), "AMAZON")
        self.assertEqual(merchant_key("AMZN Mktp CA*6L1KU6A83 866-216-1072, ON"), "AMAZON")
        self.assertEqual(merchant_key("AMAZON KE4ZF1UL3"), "AMAZON")
        self.assertEqual(merchant_key("AMAZON LR2IE3XF3 DOWNTOWN TORO"), "AMAZON")

    def test_merchant_key_groups_presto_toronto_patterns(self):
        self.assertEqual(merchant_key("PRESTO MOBI/S59XPGKHN2 TORONTO, ON"), "PRESTO")
        self.assertEqual(merchant_key("PRESTO MOBL TORONTO, ON"), "PRESTO")

    def test_merchant_key_groups_shoppers_drug_mart_variations(self):
        self.assertEqual(merchant_key("Shoppers Drug Mart Toronto, ON"), "Shoppers drug mart")
        self.assertEqual(merchant_key("SHOPPERSDRUGMART #123 TORONTO, ON"), "Shoppers drug mart")
        self.assertEqual(merchant_key("shoppers-drug-mart online"), "Shoppers drug mart")

    def test_build_merchant_groups_orders_by_frequency(self):
        groups = build_merchant_groups(
            [
                {"description": "POS STARBUCKS 123", "amount": 4.25},
                {"description": "STARBUCKS 456", "amount": 5.00},
                {"description": "GROCERY MART", "amount": 31.00},
            ]
        )

        self.assertEqual(groups[0]["merchant_key"], "STARBUCKS")
        self.assertEqual(groups[0]["count"], 2)
        self.assertEqual(groups[1]["merchant_key"], "GROCERY MART")

    def test_build_merchant_groups_returns_all_groups(self):
        groups = build_merchant_groups(
            [
                {"description": f"MERCHANT{index}", "amount": 1.00}
                for index in range(12)
            ]
        )

        self.assertEqual(len(groups), 12)

    def test_build_merchant_groups_combines_amazon_patterns(self):
        groups = build_merchant_groups(
            [
                {"description": "Amazon.ca*EL2Y62I33 866-216-1072, ON", "amount": 68.83},
                {"description": "AMZN Mktp CA*6L1KU6A83 866-216-1072, ON", "amount": 90.86},
                {"description": "AMAZON KE4ZF1UL3", "amount": 12.34},
            ]
        )

        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["merchant_key"], "AMAZON")
        self.assertEqual(groups[0]["count"], 3)

    def test_build_merchant_groups_combines_shoppers_variations(self):
        groups = build_merchant_groups(
            [
                {"description": "Shoppers Drug Mart Toronto, ON", "amount": 12.00},
                {"description": "SHOPPERSDRUGMART #123 TORONTO, ON", "amount": 18.50},
            ]
        )

        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["merchant_key"], "Shoppers drug mart")
        self.assertEqual(groups[0]["count"], 2)


if __name__ == "__main__":
    unittest.main()
