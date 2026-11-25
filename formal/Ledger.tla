------------------------------- MODULE Ledger -------------------------------
EXTENDS Naturals, FiniteSets
Days == 1..3                         \* Saturday, Sunday, Monday
Readers == {"ali", "ece"}
Actors == Readers \cup {"author"}
Week(d) == IF d <= 2 THEN 1 ELSE 2
VARIABLES day, post, receipts, accepted, total, today, weekly, budget, published
vars == <<day, post, receipts, accepted, total, today, weekly, budget, published>>
Init == /\ day = 1 /\ post = "absent" /\ receipts = {} /\ accepted = {}
        /\ total = 0 /\ today = 0 /\ weekly = 0 /\ budget = 0 /\ published = 0
Publish == /\ post = "absent" /\ published < 2
           /\ post' = "visible" /\ published' = published + 1
           /\ UNCHANGED <<day,receipts,accepted,total,today,weekly,budget>>
Moderate == /\ post \in {"visible","hidden"}
            /\ post' = IF post = "visible" THEN "hidden" ELSE "visible"
            /\ UNCHANGED <<day,receipts,accepted,total,today,weekly,budget,published>>
Remove == /\ post # "absent" /\ post' = "absent"
          /\ receipts' = {} /\ accepted' = {} /\ total' = 0 /\ weekly' = 0 /\ today' = 0
          /\ UNCHANGED <<day,budget,published>>
Vote(a) ==
  IF post = "visible" /\ a # "author" /\ <<day,a>> \notin receipts /\ budget < 2
    THEN /\ receipts' = receipts \cup {<<day,a>>}
         /\ accepted' = accepted \cup {<<day,a>>}  \* Independent, unpruned audit set for this recipe.
         /\ total' = total+1 /\ today' = today+1 /\ weekly' = weekly+1 /\ budget' = budget+1
         /\ UNCHANGED <<day,post,published>>
    ELSE UNCHANGED vars
Tick == /\ day < 3 /\ day' = day+1 /\ today' = 0 /\ budget' = 0 /\ published' = 0
        /\ weekly' = IF Week(day') = Week(day) THEN weekly ELSE 0
        /\ UNCHANGED <<post,receipts,accepted,total>>
Prune == /\ receipts' = {r \in receipts : r[1] = day}
         /\ UNCHANGED <<day,post,accepted,total,today,weekly,budget,published>>
Next == Publish \/ Moderate \/ Remove \/ Tick \/ Prune \/ (\E a \in Actors : Vote(a))
Spec == Init /\ [][Next]_vars
Counts == /\ total = Cardinality(accepted)
          /\ today = Cardinality({r \in accepted : r[1] = day})
          /\ weekly = Cardinality({r \in accepted : Week(r[1]) = Week(day)})
Integrity == /\ accepted \subseteq (1..day) \X Readers /\ receipts \subseteq accepted
             /\ {r \in accepted : r[1] = day} \subseteq receipts
             /\ (post = "absent" => accepted = {}) /\ today <= budget /\ budget \in 0..2 /\ published \in 0..2
Accounting ==
  /\ (total' > total) => (post = "visible" /\ budget' = budget+1 /\ total' = total+1)
  /\ (day' = day) => (budget' >= budget /\ published' >= published)
  /\ (post = "absent" /\ post' = "visible") => published' = published+1
Atomicity == [][Accounting]_vars
=============================================================================
