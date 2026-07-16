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


if __name__ == "__main__":
    unittest.main()
