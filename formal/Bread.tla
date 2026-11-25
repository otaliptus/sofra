------------------------------- MODULE Bread -------------------------------
EXTENDS BreadRuns
\* Every case contains bread, input, event, actual output and persistence check.
\* A state tuple contains base present, top position, base spread, extra bread.
VARIABLE row
Init == row \in Cases
Next == UNCHANGED row
Spec == Init /\ [][Next]_row
Expected ==
  LET b == row[1]
      s == row[2]
      e == row[3]
  IN CASE e = "toggleLid" ->
            IF b # "tas-ekmek" \/ ~s[1] THEN s
            ELSE [s EXCEPT ![2] = IF @ = "full" THEN "side" ELSE "full"]
       [] e = "toggleBase" ->
            <<~s[1],IF s[2] = "full" THEN "custom" ELSE s[2],FALSE,s[4]>>
       [] e = "removeAll" -> <<FALSE,"open",FALSE,FALSE>>
       [] e = "removeTop" -> [s EXCEPT ![2] = "open"]
       [] e = "restoreTop" -> [s EXCEPT ![2] = IF @ = "open" THEN "side" ELSE @]
       [] e = "placeTop" -> [s EXCEPT ![2] = "custom"]
BreadRules == row[4] = Expected /\ row[5]
=============================================================================
