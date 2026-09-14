import unittest

from app.services.categorization import build_merchant_groups, merchant_key


class CategorizationTests(unittest.TestCase):
    def test_merchant_key_groups_similar_descriptions(self):
        self.assertEqual(merchant_key("POS PURCHASE STARBUCKS #123 TORONTO"), "STARBUCKS")
        self.assertEqual(merchant_key("Debit Starbucks Toronto 456"), "STARBUCKS")
        self.assertEqual(merchant_key("SQ *Starbucks Store 047 Toronto"), "STARBUCKS")
        self.assertEqual(merchant_key("STARBUCKSSTORE1234"), "STARBUCKS")

    def test_merchant_key_groups_tim_hortons_descriptions(self):
        self.assertEqual(merchant_key("POS PURCHASE TIM HORTONS #123 TORONTO"), "TIM HORTONS")
        self.assertEqual(merchant_key("Debit Tim Hortons Toronto 456"), "TIM HORTONS")
        self.assertEqual(merchant_key("TIMHORTONSSTORE1234"), "TIM HORTONS")

    def test_merchant_key_groups_store_number_location_patterns(self):
        self.assertEqual(merchant_key("LCBO/RAO #685 TORONTO, O"), "LCBO RAO")
        self.assertEqual(merchant_key("LCBO RAO #102 OTTAWA ON"), "LCBO RAO")
        self.assertEqual(merchant_key("LCBO/RAO #42 MISSISSAUGA ON"), "LCBO RAO")

    def test_merchant_key_groups_amazon_order_patterns(self):
        self.assertEqual(merchant_key("Amazon.ca*EL2Y62I33 866-216-1072, ON"), "AMAZON")
        self.assertEqual(merchant_key("AMZN Mktp CA*6L1KU6A83 866-216-1072, ON"), "AMAZON")
        self.assertEqual(merchant_key("AMZN MKTP US 123ABC456"), "AMAZON")
        self.assertEqual(merchant_key("AMZN MKTP US*W36SL3HO3"), "AMAZON")
        self.assertEqual(merchant_key("AMAZON KE4ZF1UL3"), "AMAZON")
        self.assertEqual(merchant_key("AMAZON* KE4ZF1UL3 VANCOUVER, BC"), "AMAZON")
        self.assertEqual(merchant_key("AMAZON LR2IE3XF3 DOWNTOWN TORO"), "AMAZON")
        self.assertEqual(merchant_key("Amazon.ca Prime Member amazon.ca/pri, BC"), "AMAZON")

    def test_merchant_key_groups_presto_toronto_patterns(self):
        self.assertEqual(merchant_key("PRESTO MOBI/S59XPGKHN2 TORONTO, ON"), "PRESTO")
        self.assertEqual(merchant_key("PRESTO MOBL TORONTO, ON"), "PRESTO")
        self.assertEqual(merchant_key("PRESTO AUTORELOAD 12345"), "PRESTO")

    def test_merchant_key_groups_sephora_starting_patterns(self):
        self.assertEqual(merchant_key("Sephora Toronto Eaton Centre"), "Sephora")
        self.assertEqual(merchant_key("SEPHORA ONLINE 12345"), "Sephora")

    def test_merchant_key_groups_dollarama_contains_patterns(self):
        self.assertEqual(merchant_key("DOLLARAMA #123 TORONTO"), "Dollarama")
        self.assertEqual(merchant_key("POS PURCHASE Dollarama Mississauga"), "Dollarama")

    def test_merchant_key_groups_chatime_patterns(self):
        self.assertEqual(merchant_key("CHATIME TORONTO"), "ChaTime")
        self.assertEqual(merchant_key("POS PURCHASE CHA TIME MISSISSAUGA"), "ChaTime")

    def test_merchant_key_groups_too_good_to_go_patterns(self):
        self.assertEqual(merchant_key("TGTG R4EQZ5JEHEED1"), "Too Good to Go")
        self.assertEqual(merchant_key("POS PURCHASE TGTG R4EQZ5JEHEED1 TORONTO"), "Too Good to Go")
        self.assertEqual(merchant_key("TOOGOODT R4EQZ5JEHEED1"), "Too Good to Go")
        self.assertEqual(merchant_key("TOOGOODTOG R4EQZ5JEHEED1"), "Too Good to Go")
        self.assertEqual(merchant_key("Too Good To Go Canada Tec Toronto, ON"), "Too Good to Go")

    def test_merchant_key_groups_shoppers_drug_mart_variations(self):
        self.assertEqual(merchant_key("Shoppers Drug Mart Toronto, ON"), "Shoppers drug mart")
        self.assertEqual(merchant_key("SHOPPERSDRUGMART #123 TORONTO, ON"), "Shoppers drug mart")
        self.assertEqual(merchant_key("shoppers-drug-mart online"), "Shoppers drug mart")

    def test_merchant_key_groups_food_basics_descriptions(self):
        self.assertEqual(merchant_key("Food Basics #951 Toronto, ON"), "Food basics")
        self.assertEqual(merchant_key("POS PURCHASE FOOD BASICS MISSISSAUGA"), "Food basics")

    def test_merchant_key_groups_grab_order_patterns(self):
        self.assertEqual(merchant_key("GRAB 123456789"), "Grab")
        self.assertEqual(merchant_key("POS PURCHASE GRAB 98765 TORONTO"), "Grab")
        self.assertEqual(merchant_key("GRAB A 9EV9JCVGWRXOAV"), "Grab")
        self.assertEqual(merchant_key("GRAB A 9EV9H3PGW8I4AV"), "Grab")
        self.assertEqual(merchant_key("Grab* A-9Ev9Jcvgwrxoav"), "Grab")
        self.assertEqual(merchant_key("Grab* A-9Ev9H3Pgw8I4Av"), "Grab")

    def test_merchant_key_groups_walmart_variations(self):
        self.assertEqual(merchant_key("WALMART STORE #1234"), "Walmart")
        self.assertEqual(merchant_key("WAL MART SUPERCENTRE TORONTO"), "Walmart")
        self.assertEqual(merchant_key("Wal-Mart Online"), "Walmart")

    def test_merchant_key_groups_mcdonalds_variations(self):
        self.assertEqual(merchant_key("McDonalds Toronto"), "Mcdonalds")
        self.assertEqual(merchant_key("MCDONALD'S #123"), "Mcdonalds")
        self.assertEqual(merchant_key("MC DONALDS"), "Mcdonalds")

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

    def test_build_merchant_groups_orders_uncategorized_by_frequency_then_recency(self):
        groups = build_merchant_groups(
            [
                {"date": "2026-07-01", "description": "OLDER SINGLE", "amount": 4.25},
                {"date": "2026-07-20", "description": "RECENT SINGLE", "amount": 5.00},
                {"date": "2026-06-01", "description": "FREQUENT SHOP", "amount": 6.00},
                {"date": "2026-06-02", "description": "FREQUENT SHOP", "amount": 7.00},
            ],
            sort_mode="uncategorized_priority",
        )

        self.assertEqual(
            [group["merchant_key"] for group in groups],
            ["FREQUENT SHOP", "RECENT SINGLE", "OLDER SINGLE"],
        )

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

    def test_build_merchant_groups_combines_food_basics_descriptions(self):
        groups = build_merchant_groups(
            [
                {"description": "Food Basics #951 Toronto, ON", "amount": 42.00},
                {"description": "POS PURCHASE FOOD BASICS MISSISSAUGA", "amount": 31.25},
            ]
        )

        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["merchant_key"], "Food basics")
        self.assertEqual(groups[0]["count"], 2)

    def test_build_merchant_groups_combines_new_merchant_patterns(self):
        groups = build_merchant_groups(
            [
                {"description": "GRAB 12345", "amount": 12.00},
                {"description": "POS GRAB 67890 TORONTO", "amount": 13.00},
                {"description": "WALMART STORE #1234", "amount": 44.00},
                {"description": "WAL MART SUPERCENTRE", "amount": 21.00},
                {"description": "McDonalds Toronto", "amount": 8.00},
                {"description": "MCDONALD'S #123", "amount": 9.00},
            ]
        )

        self.assertEqual(
            sorted((group["merchant_key"], group["count"]) for group in groups),
            [("Grab", 2), ("Mcdonalds", 2), ("Walmart", 2)],
        )


if __name__ == "__main__":
    unittest.main()
